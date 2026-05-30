/**
 * ChpAlert Controller — Manage CHP escalation alerts for collectors
 *
 * When a CHP flags a patient as needing medical attention, an alert
 * is created. Collectors can view, acknowledge, and resolve these alerts.
 * Each alert includes the full patient journey for context.
 */

import type { Request, Response } from 'express';
import ChpAlert from '../schemas/ChpAlert.js';
import CounterReferral from '../schemas/CounterReferral.js';
import ReferralV2 from '../schemas/ReferralV2.js';
import type { AuthenticatedRequest } from '../middleware/regionalAuth.js';

function requireAuth(req: Request, res: Response): AuthenticatedRequest | null {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) { res.status(401).json({ success: false, error: 'Unauthorized' }); return null; }
  return authReq;
}

// ─── LIST ALERTS FOR COLLECTOR ───
export async function handleListForCollector(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const collectorId = authReq.user._id.toString();
    const { status, priority } = req.query;

    const filter: Record<string, unknown> = { collectorId };
    if (status) filter.status = status;
    if (priority) filter.priority = priority;

    const alerts = await ChpAlert.find(filter)
      .sort({ priority: 1, createdAt: -1 }) // Emergency first, then newest
      .lean()
      .exec();

    // Get counts by status
    const [openCount, emergencyCount, urgentCount] = await Promise.all([
      ChpAlert.countDocuments({ collectorId, status: 'open' }),
      ChpAlert.countDocuments({ collectorId, status: 'open', priority: 'emergency' }),
      ChpAlert.countDocuments({ collectorId, status: 'open', priority: 'urgent' }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        alerts,
        counts: { total: alerts.length, open: openCount, emergency: emergencyCount, urgent: urgentCount },
      },
    });
  } catch (error: any) {
    console.error('[ChpAlert] List error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─── GET SINGLE ALERT WITH FULL PATIENT JOURNEY ───
export async function handleGetWithJourney(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { id } = req.params;
    const collectorId = authReq.user._id.toString();

    const alert = await ChpAlert.findOne({ _id: id, collectorId }).lean().exec();
    if (!alert) { res.status(404).json({ success: false, error: 'Alert not found' }); return; }

    // Fetch the full patient journey
    const [counterReferral, originalReferral] = await Promise.all([
      CounterReferral.findById(alert.counterReferralId).lean().exec(),
      ReferralV2.findById(alert.referralId).lean().exec(),
    ]);

    // Fetch referral chain (any follow-up referrals)
    const followUpReferrals = await ReferralV2.find({
      patientId: alert.patientId,
      createdAt: { $gt: originalReferral?.createdAt || new Date(0) },
    })
      .sort({ createdAt: 1 })
      .lean()
      .exec();

    // Build timeline
    const timeline: Array<{
      date: string;
      stage: string;
      title: string;
      description: string;
      actor: string;
      location: string;
      details?: Record<string, unknown>;
    }> = [];

    if (originalReferral) {
      timeline.push({
        date: originalReferral.createdAt.toISOString(),
        stage: 'referral-created',
        title: 'Initial Referral Sent',
        description: `Patient referred for ${originalReferral.initialDiagnosis}`,
        actor: originalReferral.sourceCollectorName,
        location: originalReferral.sourceStationName,
        details: {
          urgency: originalReferral.urgency,
          reasonForReferral: originalReferral.reasonForReferral,
          modeOfTransport: originalReferral.modeOfTransport,
          aiSuggestedCategory: originalReferral.aiSuggestedCategory,
        },
      });

      if (originalReferral.acceptedAt) {
        timeline.push({
          date: originalReferral.acceptedAt.toISOString(),
          stage: 'accepted',
          title: 'Patient Accepted',
          description: 'Destination facility accepted the referral',
          actor: originalReferral.destinationStationName,
          location: originalReferral.destinationStationName,
        });
      }
    }

    if (counterReferral) {
      timeline.push({
        date: counterReferral.createdAt.toISOString(),
        stage: 'counter-referral',
        title: 'Treatment Completed',
        description: `Diagnosed: ${counterReferral.finalDiagnosis}. Treatment: ${counterReferral.treatmentProvided}`,
        actor: counterReferral.collectorName,
        location: counterReferral.stationName,
        details: {
          finalDiagnosis: counterReferral.finalDiagnosis,
          treatmentProvided: counterReferral.treatmentProvided,
          medicationsGiven: counterReferral.medicationsGiven,
          recoveryStatus: counterReferral.recoveryStatus,
          followUpInstructions: counterReferral.followUpInstructions,
          warningSigns: counterReferral.warningSigns,
        },
      });

      if (counterReferral.chpResponseReceived && counterReferral.chpResponseDate) {
        timeline.push({
          date: counterReferral.chpResponseDate.toISOString(),
          stage: 'chp-response',
          title: 'CHP Community Follow-up',
          description: counterReferral.chpResponseNotes || 'CHP submitted follow-up report',
          actor: counterReferral.chpName,
          location: 'Community',
          details: {
            chpRecoveryStatus: counterReferral.chpResponseRecoveryStatus,
            chpNeedsMedicalAttention: counterReferral.chpNeedsMedicalAttention,
            chpRecommendedAction: counterReferral.chpRecommendedAction,
            chpSymptomsObserved: counterReferral.chpSymptomsObserved,
          },
        });
      }
    }

    // Add follow-up referrals to timeline
    for (const fu of followUpReferrals) {
      // Skip the original referral
      if (fu._id.toString() === alert.referralId.toString()) continue;
      timeline.push({
        date: fu.createdAt.toISOString(),
        stage: 'follow-up-referral',
        title: 'Follow-up Referral',
        description: `Follow-up referral created for ${fu.initialDiagnosis}`,
        actor: fu.sourceCollectorName,
        location: fu.sourceStationName,
        details: {
          destination: fu.destinationStationName,
          urgency: fu.urgency,
          status: fu.status,
          referralType: (fu as any).referralType || 'follow-up',
        },
      });
    }

    // Sort timeline by date
    timeline.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    res.status(200).json({
      success: true,
      data: {
        alert,
        journey: {
          patientId: alert.patientId,
          patientName: alert.patientName,
          timeline,
          originalReferral,
          counterReferral,
          followUpReferrals,
        },
      },
    });
  } catch (error: any) {
    console.error('[ChpAlert] Get journey error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─── ACKNOWLEDGE ALERT ───
export async function handleAcknowledge(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { id } = req.params;
    const collectorId = authReq.user._id.toString();

    const alert = await ChpAlert.findOneAndUpdate(
      { _id: id, collectorId, status: 'open' },
      { status: 'acknowledged', updatedAt: new Date() },
      { new: true }
    ).lean().exec();

    if (!alert) {
      res.status(404).json({ success: false, error: 'Alert not found or already acknowledged' });
      return;
    }

    res.status(200).json({
      success: true,
      data: alert,
      message: 'Alert acknowledged. Please take appropriate action for this patient.',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─── RESOLVE ALERT ───
export async function handleResolve(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { id } = req.params;
    const collectorId = authReq.user._id.toString();
    const { resolutionAction, resolutionNotes, followUpReferralId } = req.body;

    const alert = await ChpAlert.findOneAndUpdate(
      { _id: id, collectorId, status: { $in: ['open', 'acknowledged'] } },
      {
        status: 'resolved',
        resolvedAt: new Date(),
        resolvedBy: collectorId,
        resolutionAction: resolutionAction || 'other',
        resolutionNotes: resolutionNotes || '',
        followUpReferralId: followUpReferralId || undefined,
      },
      { new: true }
    ).lean().exec();

    if (!alert) {
      res.status(404).json({ success: false, error: 'Alert not found or already resolved' });
      return;
    }

    res.status(200).json({
      success: true,
      data: alert,
      message: 'Alert resolved. Patient case closed.',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─── STATS FOR COLLECTOR ───
export async function handleStats(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const collectorId = authReq.user._id.toString();

    const [byStatus, byPriority, totalOpen, totalResolved] = await Promise.all([
      ChpAlert.aggregate([
        { $match: { collectorId } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      ChpAlert.aggregate([
        { $match: { collectorId, status: 'open' } },
        { $group: { _id: '$priority', count: { $sum: 1 } } },
      ]),
      ChpAlert.countDocuments({ collectorId, status: 'open' }),
      ChpAlert.countDocuments({ collectorId, status: 'resolved' }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        byStatus: Object.fromEntries(byStatus.map(s => [s._id, s.count])),
        byPriority: Object.fromEntries(byPriority.map(s => [s._id, s.count])),
        totalOpen,
        totalResolved,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
