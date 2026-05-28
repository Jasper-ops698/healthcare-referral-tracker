/**
 * Unified Admin Dashboard — One view for monitoring collector activity
 *
 * Shows only what an admin needs to know:
 *   1. KPIs: total referrals, collector count, today's visits, emergencies
 *   2. Recent referrals table (what collectors are doing)
 *   3. Station activity summary (where the flow is happening)
 *
 * No micro-management, no status pipeline control, no complex analytics.
 * The collector is independent — the admin just monitors.
 */

import { useState, useEffect, useMemo } from 'react';
import {
  ArrowDownLeft, ArrowUpRight, Users, HeartPulse,
  ClipboardList, MapPin, AlertTriangle, Activity,
  Loader2, Search, TrendingUp, Calendar,
} from 'lucide-react';
import {
  getAllReferralsV2, getDailyVisits, getUsers,
} from '@/lib/apiClient';
import type { ReferralV2 } from '@/types';

export default function UnifiedAdminDashboard() {
  const [referrals, setReferrals] = useState<ReferralV2[]>([]);
  const [dailyVisits, setDailyVisits] = useState<any[]>([]);
  const [collectors, setCollectors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [refRes, visitRes, userRes] = await Promise.all([
        getAllReferralsV2(),
        getDailyVisits(),
        getUsers(),
      ]);
      if (refRes.success) setReferrals(((refRes.data as any)?.referrals || []) as ReferralV2[]);
      if (visitRes.success) setDailyVisits((visitRes.data as any)?.visits || []);
      if (userRes.success) {
        const allUsers = (userRes.data as any)?.users || [];
        setCollectors(allUsers.filter((u: any) => u.role === 'collector'));
      }
    } catch (e) { console.error('Load failed:', e); }
    finally { setLoading(false); }
  };

  // ─── Computed KPIs ───
  const today = new Date().toISOString().slice(0, 10);

  const kpi = useMemo(() => {
    const emergencies = referrals.filter(r => r.urgency === 'emergency');
    const needsAttention = referrals.filter(r => r.status === 'pending' || r.status === 'in-transit');
    const inCare = referrals.filter(r => r.status === 'accepted' || r.status === 'in-treatment');
    const completed = referrals.filter(r => r.status === 'counter-referral-created' || r.status === 'completed');
    const todayVisits = dailyVisits
      .filter((v: any) => v.date === today)
      .reduce((sum: number, v: any) => sum + (v.totalVisits || 0), 0);

    return {
      totalReferrals: referrals.length,
      collectorCount: collectors.length,
      todayVisits,
      emergencyCount: emergencies.length,
      needsAttention: needsAttention.length,
      inCare: inCare.length,
      completed: completed.length,
    };
  }, [referrals, collectors, dailyVisits, today]);

  // ─── Station summary ───
  const stationSummary = useMemo(() => {
    const map = new Map<string, { name: string; type: string; incoming: number; outgoing: number; emergency: number }>();

    referrals.forEach(r => {
      // Destination stations (incoming)
      const dKey = r.destinationStationName || 'Unknown';
      const existing = map.get(dKey) || { name: dKey, type: r.destinationStationType || 'hip', incoming: 0, outgoing: 0, emergency: 0 };
      existing.incoming++;
      if (r.urgency === 'emergency') existing.emergency++;
      map.set(dKey, existing);

      // Source stations (outgoing)
      const sKey = r.sourceStationName || 'Unknown';
      const sExisting = map.get(sKey) || { name: sKey, type: r.sourceStationType || 'household', incoming: 0, outgoing: 0, emergency: 0 };
      sExisting.outgoing++;
      map.set(sKey, sExisting);
    });

    return Array.from(map.values())
      .filter(s => s.incoming > 0 || s.outgoing > 0)
      .sort((a, b) => (b.incoming + b.outgoing) - (a.incoming + a.outgoing))
      .slice(0, 8);
  }, [referrals]);

  // ─── Filtered recent referrals ───
  const recentReferrals = useMemo(() => {
    let list = [...referrals].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      list = list.filter(r =>
        r.patientName.toLowerCase().includes(q) ||
        r.patientId.toLowerCase().includes(q) ||
        r.sourceCollectorName?.toLowerCase().includes(q)
      );
    }
    return list.slice(0, 20);
  }, [referrals, searchQuery]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Monitoring collector activity across all stations
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi icon={ClipboardList} color="text-primary" bg="bg-primary/10" label="Total Referrals" value={kpi.totalReferrals} />
        <Kpi icon={Users} color="text-emerald-600" bg="bg-emerald-50" label="Collectors" value={kpi.collectorCount} />
        <Kpi icon={Calendar} color="text-sky-600" bg="bg-sky-50" label="Visits Today" value={kpi.todayVisits} />
        <Kpi icon={HeartPulse} color="text-red-600" bg="bg-red-50" label="Emergencies" value={kpi.emergencyCount} />
        <Kpi icon={AlertTriangle} color="text-amber-600" bg="bg-amber-50" label="Need Attention" value={kpi.needsAttention} />
        <Kpi icon={TrendingUp} color="text-purple-600" bg="bg-purple-50" label="Completed" value={kpi.completed} />
      </div>

      {/* Alert banner for emergencies */}
      {kpi.emergencyCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 flex items-center gap-3">
          <HeartPulse className="w-5 h-5 text-red-600 shrink-0" />
          <p className="text-sm text-red-800">
            <span className="font-semibold">{kpi.emergencyCount} emergency referral{kpi.emergencyCount > 1 ? 's' : ''}</span> in the system.
            Collectors are handling these independently.
          </p>
        </div>
      )}

      {/* Main content: Recent Referrals + Station Activity */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Recent Referrals */}
        <div className="xl:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              Recent Referrals
            </h2>
            <span className="text-xs text-muted-foreground">{referrals.length} total</span>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search patient, ID, or collector..."
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-border text-sm bg-background"
            />
          </div>

          {/* Referral list */}
          {recentReferrals.length === 0 ? (
            <div className="bg-card rounded-xl border border-border p-8 text-center text-muted-foreground">
              <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No referrals yet</p>
              <p className="text-xs">Collectors will send referrals that appear here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentReferrals.map(r => (
                <ReferralCard key={r.id} referral={r} />
              ))}
            </div>
          )}
        </div>

        {/* Right column: Station Activity + Collector Summary */}
        <div className="space-y-5">
          {/* Station Activity */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary" />
                Station Activity
              </h3>
              <span className="text-xs text-muted-foreground">{stationSummary.length} stations</span>
            </div>
            {stationSummary.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No station data yet</div>
            ) : (
              <div className="divide-y divide-border">
                {stationSummary.map(s => (
                  <div key={s.name} className="px-4 py-3 flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{s.name}</p>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{s.type}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs shrink-0">
                      <span className="flex items-center gap-1 text-emerald-600">
                        <ArrowDownLeft className="w-3 h-3" />{s.incoming}
                      </span>
                      <span className="flex items-center gap-1 text-sky-600">
                        <ArrowUpRight className="w-3 h-3" />{s.outgoing}
                      </span>
                      {s.emergency > 0 && (
                        <span className="flex items-center gap-1 text-red-600 font-bold">
                          <HeartPulse className="w-3 h-3" />{s.emergency}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Collector Snapshot */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-500" />
                Collectors
              </h3>
            </div>
            {collectors.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No collectors registered</div>
            ) : (
              <div className="divide-y divide-border">
                {collectors.slice(0, 6).map((c: any) => {
                  const cReferrals = referrals.filter(r => r.sourceCollectorId === c.id).length;
                  return (
                    <div key={c.id} className="px-4 py-3 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-xs font-bold text-emerald-700">
                        {(c.firstName?.[0] || '')}{(c.lastName?.[0] || '')}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.firstName} {c.lastName}</p>
                        <p className="text-xs text-muted-foreground">{c.stationName || 'No station'}</p>
                      </div>
                      <span className="text-xs font-semibold bg-muted px-2 py-0.5 rounded-full">{cReferrals} refs</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Daily Visits Summary */}
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border bg-muted/30">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Calendar className="w-4 h-4 text-sky-500" />
                Recent Daily Visits
              </h3>
            </div>
            {dailyVisits.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No visit logs yet</div>
            ) : (
              <div className="divide-y divide-border">
                {dailyVisits.slice(0, 7).map((v: any) => (
                  <div key={v._id || v.date} className="px-4 py-3 flex items-center justify-between">
                    <span className="text-sm">{new Date(v.date).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="font-semibold">{v.totalVisits} visits</span>
                      {v.maleVisits > 0 && <span className="text-blue-600">{v.maleVisits}M</span>}
                      {v.femaleVisits > 0 && <span className="text-pink-500">{v.femaleVisits}F</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Sub-components ─── */

function Kpi({ icon: Icon, color, bg, label, value }: {
  icon: typeof ClipboardList; color: string; bg: string; label: string; value: number;
}) {
  return (
    <div className="bg-card rounded-xl p-3 border border-border">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${color}`} />
        </div>
        <span className="text-[11px] text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function ReferralCard({ referral }: { referral: ReferralV2 }) {
  const urgencyColor = referral.urgency === 'emergency' ? 'bg-red-500' : referral.urgency === 'urgent' ? 'bg-amber-500' : 'bg-blue-400';
  const statusLabel = referral.status === 'counter-referral-created' || referral.status === 'completed' ? 'Completed'
    : referral.status === 'accepted' || referral.status === 'in-treatment' ? 'In Care'
    : referral.status === 'rejected' ? 'Rejected'
    : 'Needs Attention';
  const statusBg = statusLabel === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : statusLabel === 'In Care' ? 'bg-sky-50 text-sky-700 border-sky-200'
    : statusLabel === 'Rejected' ? 'bg-red-50 text-red-600 border-red-200'
    : 'bg-amber-50 text-amber-700 border-amber-200';

  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold text-white ${urgencyColor}`}>
              {referral.urgency}
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${statusBg}`}>
              {statusLabel}
            </span>
          </div>
          <p className="text-sm font-semibold">{referral.patientName}
            <span className="text-muted-foreground font-normal font-mono text-xs ml-1">({referral.patientId})</span>
          </p>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <ArrowDownLeft className="w-3 h-3" />{referral.sourceStationName}
            </span>
            <span className="text-border">→</span>
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />{referral.destinationStationName}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
            <span>by {referral.sourceCollectorName || 'Unknown'}</span>
            <span>·</span>
            <span>{new Date(referral.createdAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</span>
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-muted-foreground">{referral.patientAge}y · {referral.patientGender}</p>
        </div>
      </div>
      {/* Diagnosis snippet */}
      <p className="text-xs mt-2 text-amber-700 bg-amber-50 px-2 py-1 rounded line-clamp-1">
        {referral.initialDiagnosis}
      </p>
    </div>
  );
}
