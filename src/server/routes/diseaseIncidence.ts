/**
 * Disease Incidence Route — AI-powered population risk analysis
 *
 * Provides:
 *   POST /api/v1/disease-incidence/analyze  — Analyze disease incidence by village
 */

import { Router } from 'express';
import { authenticateJWT } from '../middleware/regionalAuth.js';
import { callGemini } from '../services/geminiService.js';
import { ReferralV2Model } from '../schemas/ReferralV2.js';

const router = Router();

interface VillageData {
  village: string;
  referralCount: number;
  diseases: Record<string, number>;
}

interface IncidenceResult {
  village: string;
  population: number;
  referralCount: number;
  diseaseBreakdown: Record<string, { count: number; percentageOfPopulation: number }>;
  overallAtRiskPercentage: number;
  color: string;
}

const VILLAGE_COLORS = [
  '#0ea5e9', '#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6',
  '#f43f5e', '#06b6d4', '#84cc16', '#d946ef', '#f97316',
];

router.post('/analyze', authenticateJWT, async (req, res) => {
  try {
    const { period, villages: requestedVillages } = req.body as {
      period?: 'monthly' | 'yearly';
      villages?: string[];
    };

    // Build date filter
    const dateFilter: Record<string, unknown> = {};
    if (period === 'monthly') {
      const start = new Date();
      start.setMonth(start.getMonth() - 1);
      dateFilter.createdAt = { $gte: start };
    } else if (period === 'yearly') {
      const start = new Date();
      start.setFullYear(start.getFullYear() - 1);
      dateFilter.createdAt = { $gte: start };
    }

    // Fetch referrals with villages
    const query: Record<string, unknown> = { village: { $exists: true, $ne: '' } };
    if (dateFilter.createdAt) query.createdAt = dateFilter.createdAt;
    if (requestedVillages?.length) query.village = { $in: requestedVillages };

    const referrals = await ReferralV2Model.find(query).lean();

    if (referrals.length === 0) {
      return res.json({ success: true, data: { results: [], summary: 'No village data available. Collectors must enter village names when creating referrals.' } });
    }

    // Group by village and disease
    const villageMap = new Map<string, VillageData>();
    referrals.forEach((r: any) => {
      const vName = r.village.trim();
      if (!villageMap.has(vName)) {
        villageMap.set(vName, { village: vName, referralCount: 0, diseases: {} });
      }
      const v = villageMap.get(vName)!;
      v.referralCount++;
      const disease = r.initialDiagnosis?.toLowerCase().trim() || 'unspecified';
      v.diseases[disease] = (v.diseases[disease] || 0) + 1;
    });

    const villages = Array.from(villageMap.values());
    const villageNames = villages.map(v => v.village);

    // Use Gemini to estimate village populations via web knowledge
    const prompt = `I need estimated population sizes for the following villages in Kilifi County, Kenya:
${villageNames.join('\n')}

For each village, provide ONLY the estimated population number. Use your knowledge of Kenyan coastal demographics. If unsure, provide a reasonable estimate based on typical rural Kenyan village sizes (500-5000 people).

Format your response as JSON only, no extra text:
{
  "villageName": number,
  ...
}

Use lowercase keys with spaces removed or hyphenated (e.g., "kisasu", "mtwapa", "kisauni").`;

    let populationMap: Record<string, number> = {};
    try {
      const aiResponse = await callGemini(prompt);
      // Try to extract JSON from response
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        populationMap = JSON.parse(jsonMatch[0]);
      }
    } catch {
      // Fallback: estimate 2000 per village
      villageNames.forEach(v => { populationMap[v.toLowerCase().replace(/\s+/g, '-')] = 2000; });
    }

    // Build results with incidence calculations
    const results: IncidenceResult[] = villages.map((v, i) => {
      const popKey = Object.keys(populationMap).find(
        k => k.toLowerCase() === v.village.toLowerCase().replace(/\s+/g, '-')
      );
      const population = popKey ? populationMap[popKey] : 2000;

      const diseaseBreakdown: Record<string, { count: number; percentageOfPopulation: number }> = {};
      Object.entries(v.diseases).forEach(([disease, count]) => {
        diseaseBreakdown[disease] = {
          count,
          percentageOfPopulation: parseFloat(((count / population) * 100).toFixed(2)),
        };
      });

      return {
        village: v.village,
        population,
        referralCount: v.referralCount,
        diseaseBreakdown,
        overallAtRiskPercentage: parseFloat(((v.referralCount / population) * 100).toFixed(2)),
        color: VILLAGE_COLORS[i % VILLAGE_COLORS.length],
      };
    }).sort((a, b) => b.overallAtRiskPercentage - a.overallAtRiskPercentage);

    // Summary from Gemini
    const summaryPrompt = `As a public health analyst, summarize disease referral patterns across ${villages.length} villages in Kilifi County, Kenya. ${results.length > 0 ? `The highest risk village is ${results[0].village} with ${results[0].overallAtRiskPercentage}% of population referred.` : ''} Total referrals: ${referrals.length}. Provide 2-3 concise intervention recommendations. Keep under 150 words.`;

    let summary = '';
    try {
      summary = await callGemini(summaryPrompt);
    } catch {
      summary = `Analysis shows ${referrals.length} referrals across ${villages.length} villages. Targeted interventions recommended for high-incidence areas.`;
    }

    res.json({ success: true, data: { results, summary, totalReferrals: referrals.length, villageCount: villages.length } });
  } catch (err: any) {
    console.error('[DiseaseIncidence] Error:', err.message);
    res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } });
  }
});

export default router;
