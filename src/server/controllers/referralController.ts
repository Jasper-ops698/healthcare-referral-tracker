/**
 * Referral Controller — Cross-facility patient handoff tracking
 *
 * Endpoints:
 *   POST   /api/v1/referrals                    — Create referral
 *   GET    /api/v1/referrals/incoming/:facilityId — List incoming referrals
 *   GET    /api/v1/referrals/outgoing/:facilityId — List outgoing referrals
 *   GET    /api/v1/referrals/patient/:patientId  — List patient referrals
 *   POST   /api/v1/referrals/:id/accept           — Accept referral
 *   POST   /api/v1/referrals/:id/complete        — Complete referral
 *   POST   /api/v1/referrals/:id/reject          — Reject referral
 *   GET    /api/v1/referrals/:id                 — Get single referral
 */

import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Referral from '../schemas/Referral.js';
import Patient from '../schemas/Patient.js';
import type { AuthenticatedRequest } from '../middleware/regionalAuth.js';

function requireAuth(req: Request, res: Response): AuthenticatedRequest | null {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return null;
  }
  return authReq;
}

// ─── CREATE REFERRAL ───

export async function handleCreateReferral(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const body = req.body;

    // Required fields
    if (!body.patientId || !body.toFacilityId || !body.toFacilityName || !body.reason) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'patientId, toFacilityId, toFacilityName, and reason are required' },
      });
      return;
    }

    // Verify patient exists
    const patient = await Patient.findById(body.patientId).lean().exec();
    if (!patient) {
      res.status(404).json({ success: false, error: { code: 'PATIENT_NOT_FOUND', message: 'Patient not found' } });
      return;
    }

    const newReferral = new Referral({
      patientId: new mongoose.Types.ObjectId(body.patientId),
      patientName: `${patient.firstName} ${patient.lastName}`,
      patientPhone: patient.phone,
      patientIdNumber: patient.patientId,

      fromFacilityId: body.fromFacilityId || patient.currentFacilityId || 'unknown',
      fromFacilityName: body.fromFacilityName || patient.currentFacilityName || 'Unknown',
      fromCollectorId: new mongoose.Types.ObjectId(authReq.user._id.toString()),
      fromCollectorName: `${authReq.user.firstName || ''} ${authReq.user.lastName || ''}`.trim(),

      toFacilityId: body.toFacilityId,
      toFacilityName: body.toFacilityName,

      chpId: body.chpId || patient.assignedChpId?.toString(),
      chpName: body.chpName || patient.assignedChpName,

      reason: body.reason,
      urgency: body.urgency || 'routine',
      notes: body.notes,

      medicalRecordId: body.medicalRecordId ? new mongoose.Types.ObjectId(body.medicalRecordId) : undefined,
      status: 'pending',
    });

    await newReferral.save();

    // Update patient's current facility to the receiving facility (patient is "in transit")
    await Patient.findByIdAndUpdate(
      body.patientId,
      {
        $set: {
          referralStatus: 'referred',
          status: 'referred',
        },
        $push: {
          referralStages: {
            stage: 'referred',
            facility: body.toFacilityName,
            date: new Date(),
            notes: body.reason,
          },
        },
      }
    );

    res.status(201).json({
      success: true,
      data: { referral: newReferral.toJSON() },
    });
  } catch (error: any) {
    console.error('[ReferralController] Create error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message || 'Failed to create referral' },
    });
  }
}

// ─── LIST INCOMING REFERRALS ───

export async function handleListIncoming(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { facilityId } = req.params;
    const { status } = req.query;

    const filter: Record<string, unknown> = { toFacilityId: facilityId };
    if (status) filter.status = status;

    const referrals = await Referral.find(filter)
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    res.status(200).json({
      success: true,
      data: { referrals, count: referrals.length },
    });
  } catch (error) {
    console.error('[ReferralController] List incoming error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to list incoming referrals' },
    });
  }
}

// ─── LIST OUTGOING REFERRALS ───

export async function handleListOutgoing(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { facilityId } = req.params;
    const { status } = req.query;

    const filter: Record<string, unknown> = { fromFacilityId: facilityId };
    if (status) filter.status = status;

    const referrals = await Referral.find(filter)
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    res.status(200).json({
      success: true,
      data: { referrals, count: referrals.length },
    });
  } catch (error) {
    console.error('[ReferralController] List outgoing error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to list outgoing referrals' },
    });
  }
}

// ─── LIST PATIENT REFERRALS ───

export async function handleListByPatient(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { patientId } = req.params;

    const referrals = await Referral.find({ patientId: new mongoose.Types.ObjectId(patientId) })
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    res.status(200).json({
      success: true,
      data: { referrals, count: referrals.length },
    });
  } catch (error) {
    console.error('[ReferralController] List by patient error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to list patient referrals' },
    });
  }
}

// ─── GET SINGLE REFERRAL ───

export async function handleGetReferral(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid referral ID' } });
      return;
    }

    const referral = await Referral.findById(id).lean().exec();
    if (!referral) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Referral not found' } });
      return;
    }

    res.status(200).json({ success: true, data: referral });
  } catch (error) {
    console.error('[ReferralController] Get error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to get referral' },
    });
  }
}

// ─── ACCEPT REFERRAL ───

export async function handleAcceptReferral(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { id } = req.params;
    const { collectorId, collectorName } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid referral ID' } });
      return;
    }

    const referral = await Referral.findById(id);
    if (!referral) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Referral not found' } });
      return;
    }

    // Update referral
    referral.status = 'accepted';
    referral.acceptedAt = new Date();
    referral.toCollectorId = collectorId ? new mongoose.Types.ObjectId(collectorId) : authReq.user._id;
    referral.toCollectorName = collectorName || `${authReq.user.firstName || ''} ${authReq.user.lastName || ''}`.trim();
    await referral.save();

    // Update patient: assign to receiving facility and collector
    await Patient.findByIdAndUpdate(
      referral.patientId,
      {
        $set: {
          currentFacilityId: referral.toFacilityId,
          currentFacilityName: referral.toFacilityName,
          currentCollectorId: referral.toCollectorId?.toString(),
          currentCollectorName: referral.toCollectorName,
          referralStatus: 'accepted',
          status: 'active',
        },
        $push: {
          referralStages: {
            stage: 'accepted',
            facility: referral.toFacilityName,
            date: new Date(),
            notes: `Accepted by ${referral.toCollectorName} at ${referral.toFacilityName}`,
          },
        },
      }
    );

    res.status(200).json({
      success: true,
      data: { referral: referral.toJSON() },
      message: `Patient ${referral.patientName} accepted at ${referral.toFacilityName}`,
    });
  } catch (error: any) {
    console.error('[ReferralController] Accept error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message || 'Failed to accept referral' },
    });
  }
}

// ─── COMPLETE REFERRAL ───

export async function handleCompleteReferral(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid referral ID' } });
      return;
    }

    const referral = await Referral.findById(id);
    if (!referral) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Referral not found' } });
      return;
    }

    referral.status = 'completed';
    referral.completedAt = new Date();
    await referral.save();

    // Update patient
    await Patient.findByIdAndUpdate(
      referral.patientId,
      {
        $set: {
          referralStatus: 'completed',
        },
        $push: {
          referralStages: {
            stage: 'completed',
            facility: referral.toFacilityName,
            date: new Date(),
            notes: `Treatment completed at ${referral.toFacilityName}`,
          },
        },
      }
    );

    res.status(200).json({
      success: true,
      data: { referral: referral.toJSON() },
      message: `Referral completed for ${referral.patientName}`,
    });
  } catch (error: any) {
    console.error('[ReferralController] Complete error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message || 'Failed to complete referral' },
    });
  }
}

// ─── REJECT REFERRAL ───

export async function handleRejectReferral(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { id } = req.params;
    const { reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid referral ID' } });
      return;
    }

    const referral = await Referral.findById(id);
    if (!referral) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Referral not found' } });
      return;
    }

    referral.status = 'rejected';
    referral.rejectedAt = new Date();
    referral.rejectedReason = reason || 'No reason provided';
    await referral.save();

    res.status(200).json({
      success: true,
      data: { referral: referral.toJSON() },
      message: `Referral rejected for ${referral.patientName}`,
    });
  } catch (error: any) {
    console.error('[ReferralController] Reject error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message || 'Failed to reject referral' },
    });
  }
}
