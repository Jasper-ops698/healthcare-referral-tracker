/**
 * ReferralV2 Controller — Core referral operations
 */

import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import ReferralV2 from '../schemas/ReferralV2.js';
import type { AuthenticatedRequest } from '../middleware/regionalAuth.js';

function requireAuth(req: Request, res: Response): AuthenticatedRequest | null {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) {
    res.status(401).json({ success: false, error: 'Authentication required' });
    return null;
  }
  return authReq;
}

// ─── CREATE REFERRAL ───
export async function handleCreate(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const body = req.body;
    const user = authReq.user;

    // Validate required fields
    const required = ['patientName', 'patientAge', 'patientGender', 'patientPhone', 'initialDiagnosis', 'reasonForReferral', 'destinationStationId', 'destinationStationName', 'modeOfTransport'];
    const missing = required.filter(f => !body[f]);
    if (missing.length > 0) {
      res.status(400).json({ success: false, error: `Missing: ${missing.join(', ')}` });
      return;
    }

    const newReferral = new ReferralV2({
      patientId: body.patientId || `REF-${Date.now()}`,
      patientName: body.patientName.trim(),
      patientAge: body.patientAge,
      patientGender: body.patientGender,
      patientPhone: body.patientPhone.trim(),

      sourceStationId: body.sourceStationId || user.stationId || 'unknown',
      sourceStationName: body.sourceStationName || user.stationName || 'Unknown',
      sourceStationType: body.sourceStationType || user.stationType || 'household',
      sourceCollectorId: user._id.toString(),
      sourceCollectorName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),

      destinationStationId: body.destinationStationId,
      destinationStationName: body.destinationStationName,
      destinationStationType: body.destinationStationType || 'referral-center',

      chpName: body.chpName,
      chpPhone: body.chpPhone,
      chpEmail: body.chpEmail,

      initialDiagnosis: body.initialDiagnosis.trim(),
      aiSuggestedCategory: body.aiSuggestedCategory,
      aiConfidence: body.aiConfidence,
      reasonForReferral: body.reasonForReferral.trim(),

      modeOfTransport: body.modeOfTransport,
      transportNotes: body.transportNotes,

      urgency: body.urgency || 'routine',
      status: 'pending',
      notes: body.notes,
      village: body.village?.trim() || undefined,

      // Phase C: Referral chain
      referralType: body.referralType || 'initial',
      previousReferralId: body.previousReferralId || undefined,
      chpAlertId: body.chpAlertId || undefined,
    });

    await newReferral.save();
    res.status(201).json({ success: true, data: { referral: newReferral.toJSON() } });
  } catch (error: any) {
    console.error('[ReferralV2Controller] Create error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─── LIST INCOMING (for destination station) ───
export async function handleListIncoming(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { stationId } = req.params;
    const { status, stationName } = req.query;
    // Match by destinationStationId OR destinationStationName (readable name)
    // since stationId formats vary between collector profile and referral
    const orConditions: Record<string, unknown>[] = [{ destinationStationId: stationId }];
    if (stationName) {
      orConditions.push({ destinationStationName: stationName as string });
    }
    const filter: Record<string, unknown> = { $or: orConditions };
    if (status) filter.status = status;

    const referrals = await ReferralV2.find(filter).sort({ createdAt: -1 }).lean().exec();
    res.status(200).json({ success: true, data: { referrals, count: referrals.length } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─── LIST OUTGOING (from source station) ───
export async function handleListOutgoing(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { stationId } = req.params;
    const { status } = req.query;
    const filter: Record<string, unknown> = { sourceStationId: stationId };
    if (status) filter.status = status;

    const referrals = await ReferralV2.find(filter).sort({ createdAt: -1 }).lean().exec();
    res.status(200).json({ success: true, data: { referrals, count: referrals.length } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─── LIST BY COLLECTOR ───
export async function handleListByCollector(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { collectorId } = req.params;
    const referrals = await ReferralV2.find({ sourceCollectorId: collectorId })
      .sort({ createdAt: -1 }).lean().exec();
    res.status(200).json({ success: true, data: { referrals, count: referrals.length } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─── LIST BY PATIENT ───
export async function handleListByPatient(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { patientId } = req.params;
    const referrals = await ReferralV2.find({ patientId })
      .sort({ createdAt: -1 }).lean().exec();
    res.status(200).json({ success: true, data: { referrals, count: referrals.length } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─── GET SINGLE ───
export async function handleGet(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(400).json({ success: false, error: 'Invalid ID' });
      return;
    }
    const referral = await ReferralV2.findById(id).lean().exec();
    if (!referral) { res.status(404).json({ success: false, error: 'Not found' }); return; }
    res.status(200).json({ success: true, data: referral });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─── ACCEPT REFERRAL ───
export async function handleAccept(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { id } = req.params;
    const user = authReq.user;

    const referral = await ReferralV2.findById(id);
    if (!referral) { res.status(404).json({ success: false, error: 'Not found' }); return; }

    referral.status = 'accepted';
    referral.acceptedAt = new Date();
    await referral.save();

    res.status(200).json({
      success: true,
      data: { referral: referral.toJSON() },
      message: `Patient ${referral.patientName} accepted at ${user.stationName || 'your station'}`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─── UPDATE STATUS ───
export async function handleUpdateStatus(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { id } = req.params;
    const { status } = req.body;
    const valid = ['pending', 'in-transit', 'accepted', 'in-treatment', 'counter-referral-created', 'completed', 'rejected'];
    if (!valid.includes(status)) {
      res.status(400).json({ success: false, error: `Status must be: ${valid.join(', ')}` });
      return;
    }

    const referral = await ReferralV2.findById(id);
    if (!referral) { res.status(404).json({ success: false, error: 'Not found' }); return; }

    referral.status = status;
    if (status === 'completed') referral.completedAt = new Date();
    if (status === 'rejected') { referral.rejectedAt = new Date(); referral.rejectedReason = req.body.rejectedReason; }
    await referral.save();

    res.status(200).json({ success: true, data: { referral: referral.toJSON() } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─── GET STATS BY STATION ───
export async function handleStatsByStation(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { stationId } = req.params;
    const { period } = req.query; // 'monthly' | 'yearly'

    const now = new Date();
    let startDate: Date;
    if (period === 'yearly') {
      startDate = new Date(now.getFullYear(), 0, 1);
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    }

    const [incoming, outgoing, byStatus, byUrgency] = await Promise.all([
      ReferralV2.countDocuments({ destinationStationId: stationId, createdAt: { $gte: startDate } }),
      ReferralV2.countDocuments({ sourceStationId: stationId, createdAt: { $gte: startDate } }),
      ReferralV2.aggregate([
        { $match: { $or: [{ destinationStationId: stationId }, { sourceStationId: stationId }], createdAt: { $gte: startDate } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      ReferralV2.aggregate([
        { $match: { $or: [{ destinationStationId: stationId }, { sourceStationId: stationId }], createdAt: { $gte: startDate } } },
        { $group: { _id: '$urgency', count: { $sum: 1 } } },
      ]),
    ]);

    res.status(200).json({
      success: true,
      data: {
        incoming,
        outgoing,
        byStatus: Object.fromEntries(byStatus.map(s => [s._id, s.count])),
        byUrgency: Object.fromEntries(byUrgency.map(u => [u._id, u.count])),
        period: period || 'monthly',
        startDate,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─── ADMIN: LIST ALL ───
export async function handleListAll(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { status, stationId, period } = req.query;
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    if (stationId) filter.$or = [{ sourceStationId: stationId }, { destinationStationId: stationId }];

    // Date filter
    if (period) {
      const now = new Date();
      filter.createdAt = period === 'yearly'
        ? { $gte: new Date(now.getFullYear(), 0, 1) }
        : { $gte: new Date(now.getFullYear(), now.getMonth(), 1) };
    }

    const referrals = await ReferralV2.find(filter)
      .sort({ createdAt: -1 })
      .limit(500)
      .lean()
      .exec();

    res.status(200).json({ success: true, data: { referrals, count: referrals.length } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
