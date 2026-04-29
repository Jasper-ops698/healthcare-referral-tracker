/**
 * CHP Controller — Community Health Promoter Management (Admin Only)
 *
 * CHPs are NOT system users — they have no login account.
 * They are managed by admin and assigned to patients by collectors.
 */

import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Chp from '../models/Chp.js';
import type { AuthenticatedRequest } from '../middleware/regionalAuth.js';
import { sendChpRegistrationEmail, sendChpPatientAssignedEmail } from '../services/emailService.js';

// ─── ADMIN GUARD ───

function requireAdmin(req: AuthenticatedRequest, res: Response): boolean {
  const user = req.user;
  if (!user || user.role !== 'admin') {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: 'Admin access required' },
    });
    return false;
  }
  return true;
}

// ─── GENERATE CHP ID ───

async function generateChpId(): Promise<string> {
  const count = await Chp.countDocuments().exec();
  return `CHP-${String(count + 1).padStart(4, '0')}`;
}

// ─── CREATE CHP ───

export async function handleCreateChp(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!requireAdmin(authReq, res)) return;

    const body = req.body;

    // Validation
    if (!body.fullName || !body.nationalId || !body.phone || !body.village || !body.subLocation || !body.ward || !body.county) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'fullName, nationalId, phone, village, subLocation, ward, and county are required' },
      });
      return;
    }

    // Check duplicate nationalId
    const existing = await Chp.findOne({ nationalId: body.nationalId.trim() }).exec();
    if (existing) {
      res.status(409).json({
        success: false,
        error: { code: 'NATIONAL_ID_EXISTS', message: 'A CHP with this National ID already exists' },
      });
      return;
    }

    const chpId = await generateChpId();

    const newChp = new Chp({
      chpId,
      fullName: body.fullName.trim(),
      nationalId: body.nationalId.trim(),
      phone: body.phone.trim(),
      alternatePhone: body.alternatePhone?.trim(),
      gender: body.gender || 'other',
      dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : undefined,
      village: body.village.trim(),
      subLocation: body.subLocation.trim(),
      ward: body.ward.trim(),
      county: body.county.trim(),
      languages: Array.isArray(body.languages) ? body.languages : ['Swahili'],
      yearsOfExperience: body.yearsOfExperience || 0,
      chpRegNumber: body.chpRegNumber?.trim(),
      supervisorName: body.supervisorName?.trim(),
      supervisorPhone: body.supervisorPhone?.trim(),
      facilityId: body.facilityId ? new mongoose.Types.ObjectId(body.facilityId) : undefined,
      facilityName: body.facilityName?.trim(),
      status: 'active',
      createdBy: new mongoose.Types.ObjectId(authReq.user._id),
    });

    await newChp.save();

    // ── Send CHP registration email ──
    if (body.email) {
      sendChpRegistrationEmail({
        to: body.email,
        chpName: newChp.fullName,
        chpId: newChp.chpId,
        facilityName: newChp.facilityName || 'Not assigned yet',
        registeredBy: `${authReq.user.firstName} ${authReq.user.lastName}`,
        phone: newChp.phone,
        village: newChp.village,
        county: newChp.county,
      }).catch((err: any) => {
        console.error('[ChpController] Email send failed:', err.message);
      });
    }

    res.status(201).json({
      success: true,
      data: { chp: newChp.toJSON() },
    });
  } catch (err: any) {
    console.error('[ChpController] Create error:', err);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to create CHP' },
    });
  }
}

// ─── LIST CHPs ───

export async function handleListChps(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!requireAdmin(authReq, res)) return;

    const { facilityId, county, status } = req.query;

    const filter: any = {};
    if (facilityId) filter.facilityId = new mongoose.Types.ObjectId(facilityId as string);
    if (county) filter.county = county;
    if (status) filter.status = status;

    const chps = await Chp.find(filter)
      .sort({ fullName: 1 })
      .lean()
      .exec();

    res.json({
      success: true,
      data: chps,
    });
  } catch (err: any) {
    console.error('[ChpController] List error:', err);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: err.message || 'Failed to list CHPs' },
    });
  }
}

// ─── GET SINGLE CHP ───

export async function handleGetChp(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!requireAdmin(authReq, res)) return;

    const { id } = req.params;
    const chp = await Chp.findById(id).lean().exec();

    if (!chp) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'CHP not found' } });
      return;
    }

    res.json({ success: true, data: chp });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
}

// ─── UPDATE CHP ───

export async function handleUpdateChp(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!requireAdmin(authReq, res)) return;

    const { id } = req.params;
    const updates = req.body;

    // Prevent changing chpId or nationalId via update
    delete updates.chpId;
    delete updates.nationalId;

    const chp = await Chp.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).exec();

    if (!chp) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'CHP not found' } });
      return;
    }

    res.json({ success: true, data: { chp: chp.toJSON() } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
}

// ─── DELETE (SOFT) CHP ───

// ─── NOTIFY CHP: Patient Assigned ───

export async function handleNotifyChp(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!requireAdmin(authReq, res)) return;

    const { chpId, patientName, patientId, patientPhone, patientCondition, collectorName, facilityName } = req.body;

    if (!chpId || !patientName || !patientId) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'chpId, patientName, and patientId are required' },
      });
      return;
    }

    const chp = await Chp.findById(chpId).exec();
    if (!chp) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'CHP not found' } });
      return;
    }

    if (!chp.email) {
      res.status(400).json({
        success: false,
        error: { code: 'NO_EMAIL', message: 'CHP does not have an email address on file' },
      });
      return;
    }

    await sendChpPatientAssignedEmail({
      to: chp.email,
      chpName: chp.fullName,
      patientName,
      patientId,
      patientPhone: patientPhone || 'N/A',
      patientCondition: patientCondition || 'Not specified',
      collectorName: collectorName || 'A collector',
      facilityName: facilityName || chp.facilityName || 'Unknown facility',
      assignedDate: new Date().toLocaleDateString('en-KE'),
    });

    res.json({ success: true, data: { emailSent: true, chpName: chp.fullName } });
  } catch (err: any) {
    console.error('[ChpController] Notify error:', err);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
}

export async function handleDeleteChp(req: Request, res: Response): Promise<void> {
  try {
    const authReq = req as AuthenticatedRequest;
    if (!requireAdmin(authReq, res)) return;

    const { id } = req.params;

    const chp = await Chp.findByIdAndUpdate(
      id,
      { $set: { status: 'inactive' } },
      { new: true }
    ).exec();

    if (!chp) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'CHP not found' } });
      return;
    }

    res.json({ success: true, data: { chp: chp.toJSON() } });
  } catch (err: any) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
}
