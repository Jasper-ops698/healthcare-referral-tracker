/**
 * Gemini API Service — AI-powered reports for admin dashboard
 *
 * Generates:
 *   - Initial Prevalence vs. Final Diagnosis comparison
 *   - Community Tracing Protocol effectiveness analysis
 *   - Station activity summaries
 *
 * Requires GEMINI_API_KEY environment variable.
 */

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent';

interface GeminiRequest {
  contents: { role: string; parts: { text: string }[] }[];
  generationConfig: { temperature: number; maxOutputTokens: number; topP: number };
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
  error?: { message: string };
}

export async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[GeminiService] No GEMINI_API_KEY configured');
    return 'AI reporting unavailable — GEMINI_API_KEY not configured.';
  }

  const body: GeminiRequest = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.3, maxOutputTokens: 4096, topP: 0.95 },
  };

  try {
    const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || `Gemini HTTP ${res.status}`);
    }

    const data: GeminiResponse = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response from AI.';
  } catch (err: any) {
    console.error('[GeminiService] API error:', err.message);
    return `AI report generation failed: ${err.message}`;
  }
}

// ─── INITIAL PREVALENCE VS. FINAL DIAGNOSIS ───

export async function generatePrevalenceVsDiagnosisReport(
  referrals: Array<{
    initialDiagnosis: string;
    finalDiagnosis?: string;
    sourceStationName: string;
    destinationStationName: string;
    createdAt: string;
  }>,
  period: string
): Promise<string> {
  const data = JSON.stringify(referrals, null, 2);

  const prompt = `You are a public health analyst reviewing referral data from community health stations in Kilifi County, Kenya.

Generate a structured HTML report comparing INITIAL DIAGNOSIS (what the community collector suspected) vs. FINAL DIAGNOSIS (what the referral center confirmed).

DATA (${period}):
${data}

Your report must include:
1. A summary of the most common initial diagnoses vs. final diagnoses
2. Cases where the initial diagnosis was CORRECT vs. where it was CHANGED
3. Key trends or patterns (e.g., certain conditions frequently misdiagnosed at community level)
4. Recommendations for improving community-level diagnostic accuracy
5. Format as clean HTML with h2, h3, ul, li, table tags. Use class names for styling.

Keep the tone professional and data-driven. Focus on actionable insights.`;

  return callGemini(prompt);
}

// ─── COMMUNITY TRACING PROTOCOL EFFECTIVENESS ───

export async function generateTracingProtocolReport(
  counterReferrals: Array<{
    recoveryStatus: string;
    chpResponseReceived: boolean;
    chpName: string;
    stationName: string;
    finalDiagnosis: string;
    createdAt: string;
  }>,
  period: string
): Promise<string> {
  const data = JSON.stringify(counterReferrals, null, 2);

  const prompt = `You are a community health program evaluator analyzing counter-referral follow-up data from Kilifi County, Kenya.

Generate a structured HTML report evaluating the Community Tracing Protocol effectiveness.

DATA (${period}):
${data}

Your report must include:
1. Recovery outcomes summary (how many fully recovered, partially recovered, still unwell, lost to follow-up)
2. CHP response rate and follow-up completion analysis
3. Stations with best vs. worst recovery outcomes
4. Conditions that have highest loss-to-follow-up rates
5. Effectiveness of the counter-referral system
6. Recommendations for improving community follow-up
7. Format as clean HTML with h2, h3, ul, li, table tags. Use class names for styling.

Keep the tone professional and focused on actionable public health insights.`;

  return callGemini(prompt);
}

// ─── STATION ACTIVITY SUMMARY ───

export async function generateStationSummary(
  stationStats: Array<{
    stationName: string;
    stationType: string;
    incoming: number;
    outgoing: number;
    byStatus: Record<string, number>;
    byUrgency: Record<string, number>;
  }>,
  period: string
): Promise<string> {
  const data = JSON.stringify(stationStats, null, 2);

  const prompt = `You are a health systems analyst reviewing station-level referral activity in Kilifi County, Kenya.

Generate a structured HTML summary of station activity.

DATA (${period}):
${data}

Your report must include:
1. Overview of referral flow between stations
2. Busiest stations (by incoming + outgoing volume)
3. Bottlenecks or capacity concerns
4. Emergency referral patterns by station
5. Completion rates by station
6. Format as clean HTML with h2, h3, ul, li, table tags.

Keep it concise and data-driven.`;

  return callGemini(prompt);
}
