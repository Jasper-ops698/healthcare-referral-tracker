/**
 * MedicalRecord Controller — CRUD + List
 *
 * Endpoints:
 *   GET    /api/v1/medical-records              — List all records
 *   GET    /api/v1/medical-records?patientId=…  — Filter by patient
 *   GET    /api/v1/medical-records/:id          — Get single record
 *   POST   /api/v1/medical-records              — Create record
 *   PUT    /api/v1/medical-records/:id          — Update record
 *   DELETE /api/v1/medical-records/:id          — Soft delete
 */

import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import MedicalRecord from '../models/MedicalRecord.js';
import type { IMedicalRecord } from '../models/MedicalRecord.js';
import type { AuthenticatedRequest } from '../middleware/regionalAuth.js';

// ─── HELPERS ───

async function generateRecordId(): Promise<string> {
  const count = await MedicalRecord.countDocuments();
  return `MR-${String(count + 1).padStart(6, '0')}`;
}

function requireAuth(req: Request, res: Response): AuthenticatedRequest | null {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return null;
  }
  return authReq;
}

// ─── LIST RECORDS ───

export async function handleListMedicalRecords(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { patientId, recordedBy, recordType, status } = req.query;

    const filter: Record<string, unknown> = {};
    if (patientId) filter.patientId = new mongoose.Types.ObjectId(patientId as string);
    if (recordedBy) filter.recordedBy = new mongoose.Types.ObjectId(recordedBy as string);
    if (recordType) filter.recordType = recordType;
    if (status) filter.status = status;

    const records = await MedicalRecord.find(filter)
      .sort({ createdAt: -1 })
      .lean()
      .exec();

    res.status(200).json({
      success: true,
      data: { records, count: records.length },
    });
  } catch (error) {
    console.error('[MedicalRecordController] List error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to list medical records' },
    });
  }
}

// ─── GET SINGLE RECORD ───

export async function handleGetMedicalRecord(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid record ID' } });
      return;
    }

    const record = await MedicalRecord.findById(id).lean().exec();
    if (!record) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Medical record not found' } });
      return;
    }

    res.status(200).json({ success: true, data: record });
  } catch (error) {
    console.error('[MedicalRecordController] Get error:', error);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to get medical record' } });
  }
}

// ─── CREATE RECORD ───

export async function handleCreateMedicalRecord(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const body = req.body;

    if (!body.patientId || !body.chiefComplaint || !body.diagnosis) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'patientId, chiefComplaint, and diagnosis are required' },
      });
      return;
    }

    const recordId = await generateRecordId();

    const newRecord = new MedicalRecord({
      recordId,
      patientId: new mongoose.Types.ObjectId(body.patientId),
      recordedBy: new mongoose.Types.ObjectId(authReq.user._id.toString()),
      recordType: body.recordType || 'diagnosis',
      status: body.status || 'final',
      chiefComplaint: body.chiefComplaint,
      historyOfPresentIllness: body.historyOfPresentIllness || undefined,
      reviewOfSystems: body.reviewOfSystems || undefined,
      physicalExamination: body.physicalExamination || undefined,
      vitalSigns: body.vitalSigns || undefined,
      diagnosis: Array.isArray(body.diagnosis) ? body.diagnosis : [body.diagnosis],
      differentialDiagnosis: body.differentialDiagnosis || undefined,
      clinicalNotes: body.clinicalNotes || undefined,
      medications: body.medications || [],
      labResults: body.labResults || undefined,
      procedures: body.procedures || undefined,
      followUpInstructions: body.followUpInstructions || undefined,
      referralDetails: body.referralDetails || undefined,
      encounterDate: body.encounterDate || new Date().toISOString(),
      nextFollowUpDate: body.nextFollowUpDate || undefined,
      encounterDurationMinutes: body.encounterDurationMinutes || undefined,
    });

    await newRecord.save();

    res.status(201).json({
      success: true,
      data: { record: newRecord.toJSON() },
    });
  } catch (error: any) {
    console.error('[MedicalRecordController] Create error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message || 'Failed to create medical record' },
    });
  }
}

// ─── UPDATE RECORD ───

export async function handleUpdateMedicalRecord(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid record ID' } });
      return;
    }

    const body = req.body;
    const updates: Partial<IMedicalRecord> = {};

    const allowedFields = [
      'recordType', 'status', 'chiefComplaint', 'historyOfPresentIllness',
      'reviewOfSystems', 'physicalExamination', 'vitalSigns', 'diagnosis',
      'differentialDiagnosis', 'clinicalNotes', 'medications', 'labResults',
      'procedures', 'followUpInstructions', 'referralDetails',
      'encounterDate', 'nextFollowUpDate', 'encounterDurationMinutes',
    ];

    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        (updates as any)[key] = body[key];
      }
    }

    const updated = await MedicalRecord.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    ).exec();

    if (!updated) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Medical record not found' } });
      return;
    }

    res.status(200).json({
      success: true,
      data: { record: updated.toJSON() },
    });
  } catch (error: any) {
    console.error('[MedicalRecordController] Update error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: error.message || 'Failed to update medical record' },
    });
  }
}

// ─── DELETE (soft) ───

export async function handleDeleteMedicalRecord(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_ID', message: 'Invalid record ID' } });
      return;
    }

    const deleted = await MedicalRecord.findByIdAndUpdate(
      id,
      { $set: { status: 'archived' } },
      { new: true }
    ).exec();

    if (!deleted) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Medical record not found' } });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Medical record archived',
      data: { record: deleted.toJSON() },
    });
  } catch (error) {
    console.error('[MedicalRecordController] Delete error:', error);
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL_ERROR', message: 'Failed to archive medical record' },
    });
  }
}
