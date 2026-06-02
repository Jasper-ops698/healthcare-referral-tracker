/**
 * USSD Service — Africa's Talking Integration
 *
 * CHPs can respond to counter-referrals by dialing a USSD code.
 * Works on ANY mobile phone — no internet, no smartphone needed.
 *
 * Flow:
 *   CHP dials *384*<token>#  (e.g., *384*abc123#)
 *   → Menu appears on phone screen
 *   → CHP presses numbers to navigate and respond
 *   → Response saved to counter-referral
 *   → Collector sees CHP alert on dashboard
 *
 * Setup:
 *   1. Africa's Talking account with USSD channel
 *   2. Set AFRICASTALKING_USSD_CHANNEL on Render
 *   3. Configure shortcode *384 with Africa's Talking
 */

import CounterReferral from '../schemas/CounterReferral.js';

interface USSDSession {
  phoneNumber: string;
  token: string;
  counterReferralId?: string;
  patientName?: string;
  step: 'menu' | 'status' | 'action' | 'symptoms' | 'notes' | 'confirm' | 'done';
  data: {
    recoveryStatus?: string;
    needsMedicalAttention?: boolean;
    recommendedAction?: string;
    symptomsObserved?: string;
    recoveryNotes?: string;
  };
}

// In-memory session store (resets on server restart — acceptable for USSD)
const sessions = new Map<string, USSDSession>();

const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

function getSessionKey(phoneNumber: string, token: string): string {
  return `${phoneNumber}:${token}`;
}

function getOrCreateSession(phoneNumber: string, token: string): USSDSession {
  const key = getSessionKey(phoneNumber, token);
  const existing = sessions.get(key);
  if (existing) return existing;

  const session: USSDSession = {
    phoneNumber,
    token,
    step: 'menu',
    data: {},
  };
  sessions.set(key, session);
  return session;
}

function clearSession(phoneNumber: string, token: string): void {
  sessions.delete(getSessionKey(phoneNumber, token));
}

// ─── TRUNCATE TEXT FOR USSD ───
function u(text: string, maxLen: number = 160): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 3) + '...';
}

// ─── MAIN USSD HANDLER ───

export async function handleUSSD(
  phoneNumber: string,
  token: string,
  text: string // The user's input so far (e.g., "1*2*3")
): Promise<string> {
  const inputs = text.split('*').filter(s => s.trim());
  const lastInput = inputs.length > 0 ? inputs[inputs.length - 1] : '';

  const session = getOrCreateSession(phoneNumber, token);

  // First time — validate token and show welcome
  if (session.step === 'menu' && !session.counterReferralId) {
    const counter = await CounterReferral.findOne({ chpResponseToken: token }).lean();
    if (!counter) {
      return u('END Invalid referral link. Please check with your community health worker.');
    }

    if (counter.chpResponseReceived) {
      return u('END A response has already been submitted for this patient. Thank you.');
    }

    session.counterReferralId = counter._id.toString();
    session.patientName = counter.patientName;
  }

  const patientName = session.patientName || 'the patient';

  // Route based on current step
  switch (session.step) {
    case 'menu':
      return handleMenu(session, lastInput, patientName);
    case 'status':
      return handleStatus(session, lastInput, patientName);
    case 'action':
      return handleAction(session, lastInput, patientName);
    case 'symptoms':
      return handleSymptoms(session, lastInput, patientName);
    case 'notes':
      return handleNotes(session, lastInput, patientName);
    case 'confirm':
      return handleConfirm(session, lastInput, patientName);
    case 'done':
      return u('END Thank you. Your response has been recorded.');
    default:
      return u('END An error occurred. Please try again.');
  }
}

// ─── MENU STEP ───
function handleMenu(session: USSDSession, input: string, patientName: string): string {
  if (!input || input === '') {
    return u(
      `CON HealthTrack\nPatient: ${patientName}\n\n1. Patient Status\n2. Needs Medical Attention\n3. Submit Notes\n0. Cancel`
    );
  }

  switch (input) {
    case '1':
      session.step = 'status';
      return handleStatus(session, '', patientName);
    case '2':
      session.step = 'action';
      return handleAction(session, '', patientName);
    case '3':
      session.step = 'notes';
      return handleNotes(session, '', patientName);
    case '0':
      clearSession(session.phoneNumber, session.token);
      return u('END Cancelled. No response was recorded.');
    default:
      return u(`CON Invalid option.\n\n1. Patient Status\n2. Needs Medical Attention\n3. Submit Notes\n0. Cancel`);
  }
}

// ─── STATUS STEP ───
function handleStatus(session: USSDSession, input: string, patientName: string): string {
  if (!input || input === '') {
    return u(
      `CON How is ${patientName}?\n\n1. Fully Recovered\n2. Partially Recovered\n3. Still Unwell\n4. Deceased\n5. Lost to Follow-up\n0. Back`
    );
  }

  switch (input) {
    case '1':
      session.data.recoveryStatus = 'fully-recovered';
      session.data.needsMedicalAttention = false;
      session.step = 'confirm';
      return handleConfirm(session, '', patientName);
    case '2':
      session.data.recoveryStatus = 'partially-recovered';
      session.step = 'confirm';
      return handleConfirm(session, '', patientName);
    case '3':
      session.data.recoveryStatus = 'still-unwell';
      session.data.needsMedicalAttention = true;
      session.step = 'action';
      return handleAction(session, '', patientName);
    case '4':
      session.data.recoveryStatus = 'deceased';
      session.step = 'confirm';
      return handleConfirm(session, '', patientName);
    case '5':
      session.data.recoveryStatus = 'lost-to-follow-up';
      session.step = 'confirm';
      return handleConfirm(session, '', patientName);
    case '0':
      session.step = 'menu';
      return handleMenu(session, '', patientName);
    default:
      return u(`CON Invalid option.\n\n1. Fully Recovered\n2. Partially Recovered\n3. Still Unwell\n4. Deceased\n5. Lost to Follow-up\n0. Back`);
  }
}

// ─── ACTION STEP ───
function handleAction(session: USSDSession, input: string, patientName: string): string {
  if (!input || input === '') {
    return u(
      `CON What action is needed?\n\n1. Monitor at Home\n2. See a Doctor\n3. Return to Facility\n4. Emergency - Go Now\n5. Other\n0. Back`
    );
  }

  switch (input) {
    case '1':
      session.data.recommendedAction = 'monitor';
      session.data.needsMedicalAttention = false;
      break;
    case '2':
      session.data.recommendedAction = 'see-doctor';
      session.data.needsMedicalAttention = true;
      break;
    case '3':
      session.data.recommendedAction = 'return-to-facility';
      session.data.needsMedicalAttention = true;
      break;
    case '4':
      session.data.recommendedAction = 'emergency';
      session.data.needsMedicalAttention = true;
      break;
    case '5':
      session.data.recommendedAction = 'other';
      session.data.needsMedicalAttention = true;
      break;
    case '0':
      session.step = 'menu';
      return handleMenu(session, '', patientName);
    default:
      return u(`CON Invalid option.\n\n1. Monitor at Home\n2. See a Doctor\n3. Return to Facility\n4. Emergency - Go Now\n5. Other\n0. Back`);
  }

  session.step = 'symptoms';
  return handleSymptoms(session, '', patientName);
}

// ─── SYMPTOMS STEP ───
function handleSymptoms(session: USSDSession, input: string, patientName: string): string {
  if (!input || input === '') {
    return u(
      `CON What symptoms did you observe?\n(Type symptoms or press 0 to skip)\n\nExamples:\n- Fever, wound open\n- Weakness, no appetite\n- Getting better`
    );
  }

  if (input === '0') {
    session.data.symptomsObserved = 'No symptoms reported';
  } else {
    session.data.symptomsObserved = input;
  }

  session.step = 'confirm';
  return handleConfirm(session, '', patientName);
}

// ─── NOTES STEP ───
function handleNotes(session: USSDSession, input: string, patientName: string): string {
  if (!input || input === '') {
    return u(
      `CON Any additional notes?\n(Type notes or press 0 to skip)\n0. Skip`
    );
  }

  if (input === '0') {
    session.data.recoveryNotes = '';
  } else {
    session.data.recoveryNotes = input;
  }

  if (!session.data.recoveryStatus) {
    session.step = 'status';
    return handleStatus(session, '', patientName);
  }

  session.step = 'confirm';
  return handleConfirm(session, '', patientName);
}

// ─── CONFIRM STEP ───
function handleConfirm(session: USSDSession, input: string, patientName: string): string {
  if (!input || input === '') {
    const status = session.data.recoveryStatus || 'not set';
    const action = session.data.recommendedAction || 'monitor';
    const needsCare = session.data.needsMedicalAttention ? 'YES' : 'NO';

    return u(
      `CON Confirm your response:\n\nPatient: ${patientName}\nStatus: ${status.replace(/-/g, ' ')}\nNeeds Care: ${needsCare}\nAction: ${action.replace(/-/g, ' ')}\n\n1. Submit\n2. Change Status\n3. Change Action\n0. Cancel`
    );
  }

  switch (input) {
    case '1':
      return submitResponse(session, patientName);
    case '2':
      session.step = 'status';
      return handleStatus(session, '', patientName);
    case '3':
      session.step = 'action';
      return handleAction(session, '', patientName);
    case '0':
      clearSession(session.phoneNumber, session.token);
      return u('END Cancelled. No response was recorded.');
    default:
      return handleConfirm(session, '', patientName);
  }
}

// ─── SUBMIT RESPONSE ───
async function submitResponse(session: USSDSession, patientName: string): Promise<string> {
  try {
    if (!session.counterReferralId) {
      return u('END Error: Counter-referral not found.');
    }

    const counter = await CounterReferral.findById(session.counterReferralId);
    if (!counter) {
      return u('END Error: Counter-referral not found.');
    }

    if (counter.chpResponseReceived) {
      return u('END A response has already been submitted for this patient. Thank you.');
    }

    // Save CHP response
    counter.chpResponseReceived = true;
    counter.chpResponseDate = new Date();
    counter.chpResponseNotes = session.data.recoveryNotes || `USSD response from ${session.phoneNumber}`;
    counter.chpResponseRecoveryStatus = (session.data.recoveryStatus as any) || 'partially-recovered';

    // Phase C escalation fields
    counter.chpNeedsMedicalAttention = session.data.needsMedicalAttention || false;
    counter.chpRecommendedAction = (session.data.recommendedAction as any) || undefined;
    counter.chpSymptomsObserved = session.data.symptomsObserved || undefined;

    // Auto-escalate if medical attention needed
    const isEscalated = counter.chpNeedsMedicalAttention || counter.chpResponseRecoveryStatus === 'still-unwell';
    if (isEscalated) {
      counter.status = 'escalated';
    }

    await counter.save();

    // Create CHP Alert for collector (same as web form)
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
          priority: counter.chpRecommendedAction === 'emergency' ? 'emergency'
            : counter.chpRecommendedAction === 'see-doctor' ? 'urgent' : 'routine',
          message: `CHP ${counter.chpName} reports ${counter.patientName} needs medical attention via USSD. Status: ${counter.chpResponseRecoveryStatus}. ${counter.chpSymptomsObserved ? `Observed: ${counter.chpSymptomsObserved}.` : ''} ${counter.chpRecommendedAction ? `Recommended: ${counter.chpRecommendedAction.replace(/-/g, ' ')}.` : ''}`,
          chpSymptomsObserved: counter.chpSymptomsObserved,
          chpRecommendedAction: counter.chpRecommendedAction,
        });
        console.log(`[USSD] ChpAlert created for collector ${counter.collectorId}`);
      } catch (alertErr: any) {
        console.error('[USSD] Failed to create alert:', alertErr.message);
      }
    }

    session.step = 'done';
    clearSession(session.phoneNumber, session.token);

    if (isEscalated) {
      return u('END Thank you. Your response has been recorded. The community health worker has been alerted.');
    }
    return u('END Thank you. Your response has been recorded.');

  } catch (err: any) {
    console.error('[USSD] Submit error:', err);
    return u('END An error occurred. Please try again or contact your community health worker.');
  }
}

// ─── CLEANUP OLD SESSIONS ───
export function cleanupOldUSSDSessions(): void {
  const now = Date.now();
  for (const [key, session] of sessions.entries()) {
    // Sessions older than 5 minutes are stale
    // We can't track creation time easily with Map, so just clear all periodically
    sessions.delete(key);
  }
}
