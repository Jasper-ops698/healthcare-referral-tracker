/**
 * AI Chat Route — Gemini-powered conversational health advisor
 *
 * Provides:
 *   POST /api/v1/ai/chat      — Send a message to Gemini with referral context
 *   POST /api/v1/ai/export    — Generate a downloadable report based on user request
 */

import { Router } from 'express';
import { authenticateJWT } from '../middleware/regionalAuth.js';
import { callGemini } from '../services/geminiService.js';
import { ReferralV2Model } from '../schemas/ReferralV2.js';
import { CounterReferralModel } from '../schemas/CounterReferral.js';

const router = Router();

interface ChatMessage {
  role: 'user' | 'model';
  text: string;
}

// ─── AI CHAT ───

router.post('/chat', authenticateJWT, async (req, res) => {
  try {
    const { messages, context } = req.body as {
      messages: ChatMessage[];
      context?: { period?: string; stationId?: string };
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'Messages array required' } });
    }

    const period = context?.period || 'all time';

    // Fetch recent referral data for context
    const referrals = await ReferralV2Model.find().sort({ createdAt: -1 }).limit(50).lean();
    const counterReferrals = await CounterReferralModel.find().sort({ createdAt: -1 }).limit(30).lean();

    const referralSummary = referrals.map(r => ({
      patient: r.patientName,
      age: r.patientAge,
      gender: r.patientGender,
      initialDiagnosis: r.initialDiagnosis,
      aiCategory: r.aiSuggestedCategory,
      urgency: r.urgency,
      status: r.status,
      from: r.sourceStationName,
      to: r.destinationStationName,
      collector: r.sourceCollectorName,
      chp: r.chpName,
      date: r.createdAt,
    }));

    const counterSummary = counterReferrals.map(c => ({
      patient: c.patientName,
      finalDiagnosis: c.finalDiagnosis,
      recovery: c.recoveryStatus,
      chp: c.chpName,
      station: c.stationName,
      date: c.createdAt,
    }));

    const systemPrompt = `You are HealthTrack AI, a knowledgeable public health advisor analyzing referral data from community health stations in Kilifi County, Kenya. You have access to the following referral data (${period}):

REFERRALS (${referralSummary.length} records):
${JSON.stringify(referralSummary.slice(0, 20), null, 2)}

COUNTER-REFERRALS (${counterSummary.length} records):
${JSON.stringify(counterSummary.slice(0, 10), null, 2)}

Provide concise, professional advice. Focus on:
- Interpreting disease patterns and trends
- Recommending public health interventions
- Identifying stations that need support
- Advising on referral workflow improvements
- Answering questions about specific cases or conditions

Keep responses focused and actionable. Use medical terminology appropriately but keep explanations accessible.`;

    const lastUserMessage = messages.filter(m => m.role === 'user').pop()?.text || '';
    const prompt = `${systemPrompt}\n\nConversation history:\n${messages.map(m => `${m.role}: ${m.text}`).join('\n')}\n\nRespond to the last message professionally.`;

    const response = await callGemini(prompt);

    res.json({ success: true, data: { response, timestamp: new Date().toISOString() } });
  } catch (err: any) {
    console.error('[AI Chat] Error:', err.message);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

// ─── EXPORT REPORT ───

router.post('/export', authenticateJWT, async (req, res) => {
  try {
    const { prompt: userPrompt, format } = req.body as { prompt: string; format?: 'html' | 'markdown' };

    if (!userPrompt) {
      return res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'Report prompt required' } });
    }

    // Fetch all data
    const referrals = await ReferralV2Model.find().sort({ createdAt: -1 }).lean();
    const counterReferrals = await CounterReferralModel.find().sort({ createdAt: -1 }).lean();

    const exportPrompt = `You are a public health reporting assistant. Generate a ${format === 'markdown' ? 'Markdown' : 'HTML'} report based on this request:

"${userPrompt}"

DATA:
Total Referrals: ${referrals.length}
Total Counter-Referrals: ${counterReferrals.length}

Referrals by Status: ${JSON.stringify(referrals.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc; }, {} as Record<string, number>))}
By Urgency: ${JSON.stringify(referrals.reduce((acc, r) => { acc[r.urgency] = (acc[r.urgency] || 0) + 1; return acc; }, {} as Record<string, number>))}
By Gender: ${JSON.stringify(referrals.reduce((acc, r) => { acc[r.patientGender] = (acc[r.patientGender] || 0) + 1; return acc; }, {} as Record<string, number>))}

Top Initial Diagnoses: ${JSON.stringify(Object.entries(referrals.reduce((acc, r) => { acc[r.initialDiagnosis] = (acc[r.initialDiagnosis] || 0) + 1; return acc; }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1]).slice(0, 10))}

Recovery Outcomes: ${JSON.stringify(counterReferrals.reduce((acc, c) => { acc[c.recoveryStatus] = (acc[c.recoveryStatus] || 0) + 1; return acc; }, {} as Record<string, number>))}

Generate a professional, well-structured report. ${format === 'markdown' ? 'Use Markdown formatting.' : 'Use clean HTML with inline styles for compatibility.'}`;

    const response = await callGemini(exportPrompt);

    res.json({ success: true, data: { content: response, format: format || 'html', generatedAt: new Date().toISOString() } });
  } catch (err: any) {
    console.error('[AI Export] Error:', err.message);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

export default router;
