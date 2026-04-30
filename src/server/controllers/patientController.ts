/**
 * Patient Controller — CRUD + List
 *
 * Endpoints:
 *   GET    /api/v1/patients        — List all patients
 *   GET    /api/v1/patients/:id    — Get single patient
 *   POST   /api/v1/patients        — Create patient
 *   PUT    /api/v1/patients/:id    — Update patient
 *   DELETE /api/v1/patients/:id    — Delete (soft) patient
 */

import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import Patient from '../schemas/Patient.js';
import type { IPatient } from '../schemas/Patient.js';
import type { AuthenticatedRequest } from '../middleware/regionalAuth.js';

// ─── HELPERS ───

/** Generate a human-readable patient ID */
async function generatePatientId(): Promise<string> {
  const count = await Patient.countDocuments();
  return `P1-${String(count + 1).padStart(6, '0')}`;
}

function requireAuth(req: Request, res: Response): AuthenticatedRequest | null {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return null;
  }
  return authReq;
}

// ─── LIST PATIENTS ───

export async function handleListPatients(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { status, referralStatus, registeredBy, assignedChpId, search } = req.query;

    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (referralStatus) filter.referralStatus = referralStatus;
    if (registeredBy) filter.registeredBy = new mongoose.Types.ObjectId(registeredBy as string);
    if (assignedChpId) filter.assignedChpId = new mongoose.Types.ObjectId(assignedChpId as string);

    // Text search on firstName / lastName / patientId
    if (search && typeof search === 'string' && search.trim()) {
      const q = search.trim();
      filter.$or = [
        { firstName: { $regex: q, $options: 'i' } },
        { lastName: { $regex: q, $options: 'i' } },
        { patientId: { $regex: q, $options: 'i' } },
        { phone: { $regex: q, $options: 'i' } },
      ];
    }

    const patients = await Patient.find(filter)
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    res.status(200).json({
      success: true,
      data: { patients, count: patients.length },
    });
  } catch (error) {
    console.error('[PatientController] List error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to list patients' },
    });
  }
}

// ─── GET SINGLE PATIENT ───

export async function handleGetPatient(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid patient ID' } });
      return;
    }

    const patient = await Patient.findById(id).lean().exec();
    if (!patient) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Patient not found' } });
      return;
    }

    res.status(200).json({ success: true, data: patient });
  } catch (error) {
    console.error('[PatientController] Get error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get patient' } });
  }
}

// ─── CREATE PATIENT ───

export async function handleCreatePatient(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const body = req.body;

    // Required fields
    if (!body.firstName || !body.lastName || !body.dateOfBirth || !body.gender || !body.phone || !body.address) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'firstName, lastName, dateOfBirth, gender, phone, and address are required' },
      });
      return;
    }

    const patientId = await generatePatientId();

    const newPatient = new Patient({
      patientId,
      firstName: body.firstName.trim(),
      lastName: body.lastName.trim(),
      dateOfBirth: new Date(body.dateOfBirth),
      gender: body.gender,
      phone: body.phone.trim(),
      email: body.email?.trim() || undefined,
      address: body.address,
      emergencyContact: body.emergencyContact || undefined,
      bloodType: body.bloodType || undefined,
      allergies: body.allergies || [],
      chronicConditions: body.chronicConditions || [],
      insuranceInfo: body.insuranceInfo || undefined,
      registeredBy: new mongoose.Types.ObjectId(authReq.user._id.toString()),
      assignedChpId: body.assignedChpId ? new mongoose.Types.ObjectId(body.assignedChpId) : undefined,
      assignedChpName: body.assignedChpName || undefined,
      referralStatus: body.referralStatus || 'registered',
      referralStages: body.referralStages || [],
      status: body.status || 'active',
    });

    await newPatient.save();

    res.status(201).json({
      success: true,
      data: { patient: newPatient.toJSON() },
    });
  } catch (error: any) {
    console.error('[PatientController] Create error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message || 'Failed to create patient' },
    });
  }
}

// ─── UPDATE PATIENT ───

export async function handleUpdatePatient(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid patient ID' } });
      return;
    }

    const body = req.body;
    const updates: Partial<IPatient> = {};

    // Whitelist allowed fields
    const allowedFields = [
      'firstName', 'lastName', 'dateOfBirth', 'gender', 'phone', 'email',
      'address', 'emergencyContact', 'bloodType', 'allergies',
      'chronicConditions', 'insuranceInfo', 'assignedChpId',
      'assignedChpName', 'referralStatus', 'referralStages', 'status',
    ];

    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        (updates as any)[key] = body[key];
      }
    }

    // Convert assignedChpId to ObjectId if present
    if (updates.assignedChpId && typeof updates.assignedChpId === 'string') {
      updates.assignedChpId = new mongoose.Types.ObjectId(updates.assignedChpId) as any;
    }

    const updated = await Patient.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).exec();

    if (!updated) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Patient not found' } });
      return;
    }

    res.status(200).json({
      success: true,
      data: { patient: updated.toJSON() },
    });
  } catch (error: any) {
    console.error('[PatientController] Update error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message || 'Failed to update patient' },
    });
  }
}

// ─── DELETE PATIENT (soft delete) ───

export async function handleDeletePatient(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid patient ID' } });
      return;
    }

    const deleted = await Patient.findByIdAndUpdate(
      id,
      { $set: { status: 'inactive' } },
      { new: true }
    ).exec();

    if (!deleted) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Patient not found' } });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Patient marked as inactive',
      data: { patient: deleted.toJSON() },
    });
  } catch (error) {
    console.error('[PatientController] Delete error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to delete patient' },
    });
  }
}
