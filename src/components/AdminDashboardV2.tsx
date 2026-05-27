/**
 * AdminDashboardV2 — Redesigned admin dashboard focused on referral analytics
 *
 * Features:
 *   - Activity by Station (monthly/yearly toggle)
 *   - Referral volume stats (incoming, outgoing, by status, by urgency)
 *   - Counter-referral stats (recovery status, CHP response rate)
 *   - AI Reports (Initial Prevalence vs Final Diagnosis, Community Tracing Protocol)
 *   - Station management overview
 */

import { useState, useEffect, useCallback } from 'react';
import {
  BarChart3, Activity, ArrowRight, ArrowLeft, Mail,
  Building2, RefreshCw, Sparkles, Stethoscope, HeartPulse,
  TrendingUp, Users, Zap,
} from 'lucide-react';

interface StationActivity {
  stationId: string;
  stationName: string;
  stationType: string;
  incoming: number;
  outgoing: number;
  byStatus: Record<string, number>;
  byUrgency: Record<string, number>;
}

interface CounterReferralStats {
  byRecoveryStatus: Record<string, number>;
  byStation: Record<string, number>;
  totalActive: number;
  totalClosed: number;
  chpResponseRate: number;
  chpResponseDetails: { total: number; responded: number };
}

interface AIReport {
  title: string;
  html: string;
  generatedAt: string;
}

type Period = 'monthly' | 'yearly';
type ReportType = 'prevalence' | 'tracing' | 'summary';

export default function AdminDashboardV2() {
  const [period, setPeriod] = useState<Period>('monthly');
  const [stationActivities, setStationActivities] = useState<StationActivity[]>([]);
  const [counterStats, setCounterStats] = useState<CounterReferralStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [, setError] = useState('');

  const [aiReport, setAiReport] = useState<AIReport | null>(null);
  const [generatingReport, setGeneratingReport] = useState<ReportType | null>(null);

  // Fetch all station activities
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const jwtToken = localStorage.getItem('healthtrack_jwt_token');
      const headers: Record<string, string> = {};
      if (jwtToken) headers.Authorization = `Bearer ${jwtToken}`;

      // Get all referrals
      const referralsRes = await fetch(`/api/v1/referrals-v2/all?period=${period}`, { headers });
      const referralsData = await referralsRes.json();

      if (referralsData.success && referralsData.data?.referrals) {
        const referrals = referralsData.data.referrals;

        // Aggregate by station
        const stationMap = new Map<string, StationActivity>();

        for (const r of referrals) {
          // Destination station (incoming)
          const destId = r.destinationStationId;
          if (!stationMap.has(destId)) {
            stationMap.set(destId, {
              stationId: destId,
              stationName: r.destinationStationName,
              stationType: r.destinationStationType,
              incoming: 0,
              outgoing: 0,
              byStatus: {},
              byUrgency: {},
            });
          }
          const dest = stationMap.get(destId)!;
          dest.incoming++;
          dest.byStatus[r.status] = (dest.byStatus[r.status] || 0) + 1;
          dest.byUrgency[r.urgency] = (dest.byUrgency[r.urgency] || 0) + 1;

          // Source station (outgoing)
          const srcId = r.sourceStationId;
          if (!stationMap.has(srcId)) {
            stationMap.set(srcId, {
              stationId: srcId,
              stationName: r.sourceStationName,
              stationType: r.sourceStationType,
              incoming: 0,
              outgoing: 0,
              byStatus: {},
              byUrgency: {},
            });
          }
          stationMap.get(srcId)!.outgoing++;
        }

        setStationActivities(Array.from(stationMap.values()));
      }

      // Get counter-referral stats
      const counterRes = await fetch(`/api/v1/counter-referrals/stats/all?period=${period}`, { headers });
      const counterData = await counterRes.json();
      if (counterData.success) {
        setCounterStats(counterData.data);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Generate AI report
  const generateAIReport = async (type: ReportType) => {
    setGeneratingReport(type);
    try {
      const jwtToken = localStorage.getItem('healthtrack_jwt_token');
      const aiHeaders: Record<string, string> = {};
      if (jwtToken) aiHeaders.Authorization = `Bearer ${jwtToken}`;
      const res = await fetch(`/api/v1/referrals-v2/ai-report?type=${type}&period=${period}`, {
        headers: aiHeaders,
      });
      const result = await res.json();
      if (result.success) {
        setAiReport({
          title: result.data.title,
          html: result.data.html,
          generatedAt: result.data.generatedAt,
        });
      }
    } catch (err: any) {
      console.error('AI report failed:', err);
    } finally {
      setGeneratingReport(null);
    }
  };

  // Totals
  const totals = stationActivities.reduce((acc, s) => ({
    incoming: acc.incoming + s.incoming,
    outgoing: acc.outgoing + s.outgoing,
  }), { incoming: 0, outgoing: 0 });

  const statusCounts = stationActivities.reduce<Record<string, number>>((acc, s) => {
    for (const [k, v] of Object.entries(s.byStatus)) {
      acc[k] = (acc[k] || 0) + v;
    }
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Activity className="w-5 h-5 text-primary" />
            Referral Analytics
          </h2>
          <p className="text-sm text-muted-foreground">Activity across all stations</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={period}
            onChange={e => setPeriod(e.target.value as Period)}
            className="px-3 py-2 rounded-lg border border-border text-sm"
          >
            <option value="monthly">This Month</option>
            <option value="yearly">This Year</option>
          </select>
          <button
            onClick={fetchData}
            className="p-2 rounded-lg border border-border hover:bg-muted transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard
          label="Total Incoming"
          value={totals.incoming}
          icon={ArrowRight}
          iconColor="text-emerald-600"
          bgColor="bg-emerald-50"
        />
        <KpiCard
          label="Total Outgoing"
          value={totals.outgoing}
          icon={ArrowLeft}
          iconColor="text-blue-600"
          bgColor="bg-blue-50"
        />
        <KpiCard
          label="Active Cases"
          value={statusCounts['accepted'] + statusCounts['in-treatment'] || 0}
          icon={Stethoscope}
          iconColor="text-amber-600"
          bgColor="bg-amber-50"
        />
        <KpiCard
          label="CHP Response Rate"
          value={counterStats ? `${counterStats.chpResponseRate}%` : 'N/A'}
          icon={Mail}
          iconColor="text-purple-600"
          bgColor="bg-purple-50"
          subvalue={counterStats ? `${counterStats.chpResponseDetails.responded}/${counterStats.chpResponseDetails.total}` : ''}
        />
      </div>

      {/* Status Breakdown */}
      <div className="bg-card rounded-xl border border-border p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <BarChart3 className="w-4 h-4" />
          Referral Status Breakdown
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
          {[
            { key: 'pending', label: 'Pending', color: 'bg-slate-400' },
            { key: 'in-transit', label: 'In Transit', color: 'bg-blue-400' },
            { key: 'accepted', label: 'Accepted', color: 'bg-emerald-400' },
            { key: 'in-treatment', label: 'In Treatment', color: 'bg-amber-400' },
            { key: 'counter-referral-created', label: 'Counter-Ref', color: 'bg-purple-400' },
            { key: 'completed', label: 'Completed', color: 'bg-green-500' },
            { key: 'rejected', label: 'Rejected', color: 'bg-red-400' },
          ].map(({ key, label, color }) => {
            const count = statusCounts[key] || 0;
            const max = Math.max(...Object.values(statusCounts), 1);
            const pct = Math.round((count / max) * 100);
            return (
              <div key={key} className="text-center">
                <div className="text-2xl font-bold">{count}</div>
                <div className="text-xs text-muted-foreground mb-1">{label}</div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Station Activity Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Activity by Station
          </h3>
          <span className="text-xs text-muted-foreground">{stationActivities.length} stations</span>
        </div>

        {stationActivities.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            {loading ? 'Loading...' : 'No station activity data'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/50">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Station</th>
                  <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Type</th>
                  <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">
                    <span className="flex items-center justify-center gap-1"><ArrowRight className="w-3 h-3" /> Incoming</span>
                  </th>
                  <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">
                    <span className="flex items-center justify-center gap-1"><ArrowLeft className="w-3 h-3" /> Outgoing</span>
                  </th>
                  <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Emergency</th>
                  <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Urgent</th>
                  <th className="text-center px-4 py-2.5 font-medium text-muted-foreground">Routine</th>
                </tr>
              </thead>
              <tbody>
                {stationActivities.map(s => (
                  <tr key={s.stationId} className="border-t border-border hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-medium">{s.stationName}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        s.stationType === 'referral-center' ? 'bg-amber-100 text-amber-700' :
                        s.stationType === 'hip' ? 'bg-blue-100 text-blue-700' :
                        'bg-emerald-100 text-emerald-700'
                      }`}>
                        {s.stationType.replace('-', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center font-semibold text-emerald-700">{s.incoming}</td>
                    <td className="px-4 py-3 text-center font-semibold text-blue-700">{s.outgoing}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-red-600 font-medium">{s.byUrgency['emergency'] || 0}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-amber-600 font-medium">{s.byUrgency['urgent'] || 0}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="text-blue-600 font-medium">{s.byUrgency['routine'] || 0}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recovery Status */}
      {counterStats && (
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <HeartPulse className="w-4 h-4" />
            Patient Recovery Outcomes
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { key: 'fully-recovered', label: 'Fully Recovered', color: 'text-emerald-600', bg: 'bg-emerald-50' },
              { key: 'partially-recovered', label: 'Partially Recovered', color: 'text-amber-600', bg: 'bg-amber-50' },
              { key: 'still-unwell', label: 'Still Unwell', color: 'text-red-600', bg: 'bg-red-50' },
              { key: 'deceased', label: 'Deceased', color: 'text-slate-600', bg: 'bg-slate-100' },
              { key: 'lost-to-follow-up', label: 'Lost to Follow-up', color: 'text-gray-500', bg: 'bg-gray-50' },
            ].map(({ key, label, color, bg }) => (
              <div key={key} className={`${bg} rounded-lg p-3 text-center`}>
                <p className={`text-2xl font-bold ${color}`}>{counterStats.byRecoveryStatus[key] || 0}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AI Reports Section */}
      <div className="bg-card rounded-xl border border-border p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-500" />
          AI-Generated Reports
        </h3>

        <div className="flex flex-wrap gap-2 mb-4">
          {[
            { type: 'prevalence' as ReportType, label: 'Prevalence vs Diagnosis', icon: TrendingUp },
            { type: 'tracing' as ReportType, label: 'Community Tracing Protocol', icon: Users },
            { type: 'summary' as ReportType, label: 'Station Summary', icon: Zap },
          ].map(({ type, label, icon: Icon }) => (
            <button
              key={type}
              onClick={() => generateAIReport(type)}
              disabled={!!generatingReport}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-primary/5 hover:border-primary/30 transition-colors text-sm font-medium disabled:opacity-50"
            >
              {generatingReport === type ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Icon className="w-4 h-4" />
              )}
              {generatingReport === type ? 'Generating...' : label}
            </button>
          ))}
        </div>

        {aiReport && (
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="bg-muted/50 px-4 py-2 border-b border-border flex items-center justify-between">
              <span className="text-sm font-medium flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                {aiReport.title}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(aiReport.generatedAt).toLocaleString()}
              </span>
            </div>
            <div
              className="p-4 prose prose-sm max-w-none"
              dangerouslySetInnerHTML={{ __html: aiReport.html }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── KPI Card ───
function KpiCard({
  label,
  value,
  icon: Icon,
  iconColor,
  bgColor,
  subvalue,
}: {
  label: string;
  value: number | string;
  icon: typeof Activity;
  iconColor: string;
  bgColor: string;
  subvalue?: string;
}) {
  return (
    <div className="bg-card rounded-xl p-4 border border-border">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-lg ${bgColor} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
      {subvalue && <p className="text-xs text-muted-foreground mt-0.5">{subvalue}</p>}
    </div>
  );
}
