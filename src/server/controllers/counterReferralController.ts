/**
 * CounterReferral Controller — Manage counter-referrals and CHP follow-up
 */

import type { Request, Response } from 'express';
import mongoose from 'mongoose';
import crypto from 'crypto';
import CounterReferral from '../schemas/CounterReferral.js';
import ReferralV2 from '../schemas/ReferralV2.js';
import type { AuthenticatedRequest } from '../middleware/regionalAuth.js';
import { sendChpFollowUpEmail } from '../services/emailService.js';

function requireAuth(req: Request, res: Response): AuthenticatedRequest | null {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) { res.status(401).json({ success: false, error: 'Unauthorized' }); return null; }
  return authReq;
}

// ─── CREATE COUNTER-REFERRAL ───
export async function handleCreate(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;
    const user = authReq.user;
    const body = req.body;

    // Validate
    const required = ['referralId', 'patientId', 'patientName', 'finalDiagnosis', 'treatmentProvided', 'followUpInstructions', 'chpName'];
    const missing = required.filter(f => !body[f]);
    if (missing.length > 0) { res.status(400).json({ success: false, error: `Missing: ${missing.join(', ')}` }); return; }

    // Verify original referral exists
    const original = await ReferralV2.findById(body.referralId);
    if (!original) { res.status(404).json({ success: false, error: 'Original referral not found' }); return; }

    // Generate unique token for CHP form link
    const responseToken = crypto.randomBytes(32).toString('hex');

    const counter = new CounterReferral({
      referralId: new mongoose.Types.ObjectId(body.referralId),
      patientId: body.patientId,
      patientName: body.patientName,
      stationId: user.stationId || 'unknown',
      stationName: user.stationName || 'Unknown',
      collectorId: user._id.toString(),
      collectorName: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
      finalDiagnosis: body.finalDiagnosis.trim(),
      treatmentProvided: body.treatmentProvided.trim(),
      medicationsGiven: body.medicationsGiven,
      proceduresDone: body.proceduresDone,
      recoveryStatus: body.recoveryStatus || 'still-unwell',
      recoveryNotes: body.recoveryNotes,
      nextVisitDate: body.nextVisitDate ? new Date(body.nextVisitDate) : undefined,
      followUpInstructions: body.followUpInstructions.trim(),
      warningSigns: body.warningSigns,
      chpName: body.chpName.trim(),
      chpPhone: body.chpPhone,
      chpEmail: body.chpEmail,
      chpResponseToken: responseToken,
      status: 'active',
    });

    await counter.save();

    // Link counter-referral to original
    original.status = 'counter-referral-created';
    original.counterReferralId = counter._id as mongoose.Types.ObjectId;
    await original.save();

    // Send CHP follow-up email if email provided
    let emailResult: { success: boolean; messageId?: string; error?: string } = { success: false, error: 'No CHP email provided' };
    if (body.chpEmail) {
      try {
        const baseUrl = process.env.APP_BASE_URL || (process.env.RENDER_EXTERNAL_URL) || '';
        if (!baseUrl) {
          console.warn('[CounterReferral] APP_BASE_URL not set — CHP form link will be broken');
        }
        const formUrl = baseUrl ? `${baseUrl}/chp-feedback/${responseToken}` : '';
        emailResult = await sendChpFollowUpEmail({
          chpEmail: body.chpEmail,
          chpName: body.chpName,
          patientName: body.patientName,
          patientId: body.patientId,
          finalDiagnosis: body.finalDiagnosis,
          followUpInstructions: body.followUpInstructions,
          nextVisitDate: body.nextVisitDate ? new Date(body.nextVisitDate).toLocaleDateString() : undefined,
          warningSigns: body.warningSigns,
          recoveryStatus: body.recoveryStatus || 'still-unwell',
          formUrl,
        });
        if (emailResult.success) {
          counter.chpEmailSent = true;
          counter.chpEmailSentAt = new Date();
          counter.chpEmailStatus = 'sent';
          console.log('[CounterReferral] CHP email sent to', body.chpEmail, 'messageId:', emailResult.messageId);
        } else {
          counter.chpEmailStatus = 'failed';
          console.error('[CounterReferral] CHP email failed:', emailResult.error);
        }
        await counter.save();
      } catch (emailErr: any) {
        console.error('[CounterReferral] Email exception:', emailErr);
        counter.chpEmailStatus = 'failed';
        emailResult = { success: false, error: emailErr.message };
        await counter.save();
      }
    }

    res.status(201).json({
      success: true,
      data: { counterReferral: counter.toJSON() },
      emailSent: emailResult.success,
      emailError: emailResult.error || undefined,
      message: emailResult.success
        ? `Counter-referral created for ${body.patientName}. CHP ${body.chpName} assigned — follow-up email sent.`
        : `Counter-referral created for ${body.patientName}. CHP ${body.chpName} assigned — but follow-up email failed: ${emailResult.error}. Please contact CHP manually.`,
    });
  } catch (error: any) {
    console.error('[CounterReferral] Create error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─── LIST BY STATION ───
export async function handleListByStation(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { stationId } = req.params;
    const { status } = req.query;
    const filter: Record<string, unknown> = { stationId };
    if (status) filter.status = status;

    const counters = await CounterReferral.find(filter)
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    res.status(200).json({ success: true, data: { counterReferrals: counters, count: counters.length } });
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
    const counters = await CounterReferral.find({ patientId })
      .sort({ createdAt: -1 })
      .lean()
      .exec();
    res.status(200).json({ success: true, data: { counterReferrals: counters, count: counters.length } });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─── GET SINGLE ───
export async function handleGet(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const counter = await CounterReferral.findById(id).lean().exec();
    if (!counter) { res.status(404).json({ success: false, error: 'Not found' }); return; }
    res.status(200).json({ success: true, data: counter });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─── UPDATE ───
export async function handleUpdate(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { id } = req.params;
    const body = req.body;

    const counter = await CounterReferral.findByIdAndUpdate(
      id,
      {
        finalDiagnosis: body.finalDiagnosis,
        treatmentProvided: body.treatmentProvided,
        medicationsGiven: body.medicationsGiven,
        proceduresDone: body.proceduresDone,
        recoveryStatus: body.recoveryStatus,
        recoveryNotes: body.recoveryNotes,
        nextVisitDate: body.nextVisitDate ? new Date(body.nextVisitDate) : undefined,
        followUpInstructions: body.followUpInstructions,
        warningSigns: body.warningSigns,
        chpName: body.chpName,
        chpPhone: body.chpPhone,
        chpEmail: body.chpEmail,
        status: body.status,
        ...(body.status === 'closed' ? { closedAt: new Date() } : {}),
      },
      { new: true }
    ).lean().exec();

    if (!counter) { res.status(404).json({ success: false, error: 'Not found' }); return; }
    res.status(200).json({ success: true, data: counter });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─── CHP FORM SUBMISSION (no auth — public token-based) ───
const VALID_RECOVERY_STATUSES = ['fully-recovered', 'partially-recovered', 'still-unwell', 'deceased', 'lost-to-follow-up'];
const VALID_RECOMMENDED_ACTIONS = ['see-doctor', 'return-to-facility', 'emergency', 'monitor', 'other'];

export async function handleChpFormSubmit(req: Request, res: Response): Promise<void> {
  try {
    const { token } = req.params;
    const {
      recoveryStatus,
      recoveryNotes,
      needsMedicalAttention,
      recommendedAction,
      symptomsObserved,
    } = req.body;

    // Validate recoveryStatus
    if (!recoveryStatus || !VALID_RECOVERY_STATUSES.includes(recoveryStatus)) {
      res.status(400).json({ success: false, error: `recoveryStatus must be one of: ${VALID_RECOVERY_STATUSES.join(', ')}` });
      return;
    }

    // Validate recommendedAction if provided
    if (recommendedAction && !VALID_RECOMMENDED_ACTIONS.includes(recommendedAction)) {
      res.status(400).json({ success: false, error: `recommendedAction must be one of: ${VALID_RECOMMENDED_ACTIONS.join(', ')}` });
      return;
    }

    const counter = await CounterReferral.findOne({ chpResponseToken: token });
    if (!counter) { res.status(404).json({ success: false, error: 'Invalid or expired link' }); return; }

    // Prevent duplicate submissions
    if (counter.chpResponseReceived) {
      res.status(409).json({ success: false, error: 'A response has already been submitted for this patient' });
      return;
    }

    // Save CHP response
    counter.chpResponseReceived = true;
    counter.chpResponseDate = new Date();
    counter.chpResponseNotes = recoveryNotes;
    counter.chpResponseRecoveryStatus = recoveryStatus;

    // Phase C: Save escalation fields
    counter.chpNeedsMedicalAttention = !!needsMedicalAttention;
    counter.chpRecommendedAction = recommendedAction || undefined;
    counter.chpSymptomsObserved = symptomsObserved || undefined;

    // Auto-escalate if CHP flags medical attention needed
    const isEscalated = !!needsMedicalAttention || recoveryStatus === 'still-unwell';
    if (isEscalated) {
      counter.status = 'escalated';
    }

    await counter.save();

    // Phase C: Create CHP Alert for collector if escalated
    if (isEscalated) {
      try {
        const ChpAlert = (await import('../schemas/ChpAlert.js')).default;
        await ChpAlert.create({
          collectorId: counter.collectorId,
          counterReferralId: counter._id,
          referralId: counter.referralId,
          patientId: counter.patientId,
          patientName: counter.patientName,
          chpName: counter.chpName,
          status: 'open',
          priority: recommendedAction === 'emergency' ? 'emergency' : recommendedAction === 'see-doctor' ? 'urgent' : 'routine',
          message: `CHP ${counter.chpName} reports ${counter.patientName} needs medical attention. ` +
            `Status: ${recoveryStatus}. ` +
            `${symptomsObserved ? `Observed: ${symptomsObserved}. ` : ''}` +
            `${recommendedAction ? `Recommended: ${recommendedAction.replace(/-/g, ' ')}.` : ''}`,
          chpSymptomsObserved: symptomsObserved,
          chpRecommendedAction: recommendedAction,
        });
        console.log(`[ChpAlert] Created alert for collector ${counter.collectorId} — patient ${counter.patientName}`);
      } catch (alertErr: any) {
        console.error('[ChpAlert] Failed to create alert:', alertErr.message);
        // Don't fail the CHP submission if alert creation fails
      }
    }

    // Also update the original referral status if escalated
    if (isEscalated) {
      try {
        await ReferralV2.findByIdAndUpdate(
          counter.referralId,
          { status: 'counter-referral-created' }, // Keep as is, but alert signals the issue
        );
      } catch {
        // Non-critical, don't fail the submission
      }
    }

    res.status(200).json({
      success: true,
      escalated: isEscalated,
      message: isEscalated
        ? `Thank you. Recovery update recorded. The community health worker has been alerted about ${counter.patientName}'s condition.`
        : `Thank you. Recovery update for ${counter.patientName} has been recorded.`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─── CHP FORM DATA (for rendering the form) ───
export async function handleChpFormData(req: Request, res: Response): Promise<void> {
  try {
    const { token } = req.params;
    const counter = await CounterReferral.findOne({ chpResponseToken: token }).lean().exec();
    if (!counter) { res.status(404).json({ success: false, error: 'Invalid link' }); return; }

    res.status(200).json({
      success: true,
      data: {
        patientName: counter.patientName,
        patientId: counter.patientId,
        finalDiagnosis: counter.finalDiagnosis,
        followUpInstructions: counter.followUpInstructions,
        chpName: counter.chpName,
        recoveryStatus: counter.recoveryStatus,
        alreadyResponded: counter.chpResponseReceived,
        // Phase C: Show escalation fields if available
        showEscalationFields: true,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}

// ─── STATS FOR ADMIN ───
export async function handleStats(req: Request, res: Response): Promise<void> {
  try {
    const authReq = requireAuth(req, res);
    if (!authReq) return;

    const { period } = req.query; // 'monthly' | 'yearly'
    const now = new Date();
    const startDate = period === 'yearly'
      ? new Date(now.getFullYear(), 0, 1)
      : new Date(now.getFullYear(), now.getMonth(), 1);

    const [byRecoveryStatus, byStation, totalActive, totalClosed, chpResponseRate] = await Promise.all([
      CounterReferral.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        { $group: { _id: '$recoveryStatus', count: { $sum: 1 } } },
      ]),
      CounterReferral.aggregate([
        { $match: { createdAt: { $gte: startDate } } },
        { $group: { _id: '$stationName', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      CounterReferral.countDocuments({ status: 'active', createdAt: { $gte: startDate } }),
      CounterReferral.countDocuments({ status: 'closed', createdAt: { $gte: startDate } }),
      CounterReferral.aggregate([
        { $match: { chpEmailSent: true, createdAt: { $gte: startDate } } },
        { $group: { _id: null, total: { $sum: 1 }, responded: { $sum: { $cond: ['$chpResponseReceived', 1, 0] } } } },
      ]),
    ]);

    const responseRate = chpResponseRate[0]
      ? Math.round((chpResponseRate[0].responded / chpResponseRate[0].total) * 100)
      : 0;

    res.status(200).json({
      success: true,
      data: {
        byRecoveryStatus: Object.fromEntries(byRecoveryStatus.map(s => [s._id, s.count])),
        byStation: Object.fromEntries(byStation.map(s => [s._id, s.count])),
        totalActive,
        totalClosed,
        chpResponseRate: responseRate,
        chpResponseDetails: chpResponseRate[0] || { total: 0, responded: 0 },
        period: period || 'monthly',
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
}
