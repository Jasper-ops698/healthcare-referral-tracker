/**
 * CollectorOverview v2 — Referral-focused dashboard
 *
 * Replaced patient-registration metrics with referral workflow KPIs:
 * - Daily visit counts
 * - Referrals sent
 * - Incoming patients
 * - Counter-referrals created
 */

import { useState, useEffect } from 'react';
import {
  Users, Send, ClipboardList, ArrowRightLeft,
  TrendingUp, CheckCircle2,
  AlertTriangle, Stethoscope, Calendar,
  ChevronRight, Loader2,
} from 'lucide-react';
import { format, subDays, isToday, parseISO } from 'date-fns';
import { getDailyVisits, getOutgoingReferrals, getIncomingReferrals } from '@/lib/apiClient';
import type { ReferralV2 } from '@/types';

interface Props {
  stationId: string;
  stationName: string;
  collectorId: string;
  onLogVisits: () => void;
  onSendReferral: () => void;
  onCounterReferral: () => void;
}

interface DailyVisit {
  _id: string;
  date: string;
  totalVisits: number;
}

export default function CollectorOverview({
  stationId, stationName, collectorId, onLogVisits, onSendReferral, onCounterReferral,
}: Props) {
  const [visits, setVisits] = useState<DailyVisit[]>([]);
  const [outgoing, setOutgoing] = useState<ReferralV2[]>([]);
  const [incoming, setIncoming] = useState<ReferralV2[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [stationId, collectorId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [vRes, oRes, iRes] = await Promise.all([
        getDailyVisits(stationId),
        getOutgoingReferrals(stationId),
        getIncomingReferrals(stationId),
      ]);
      if (vRes.success) setVisits((vRes.data as any)?.visits || []);
      if (oRes.success) setOutgoing((oRes.data as any)?.referrals || []);
      if (iRes.success) setIncoming((iRes.data as any)?.referrals || []);
    } catch (e) { console.error('Dashboard load failed:', e); }
    finally { setLoading(false); }
  };

  // KPIs
  const todayVisits = visits.filter(v => v.date === format(new Date(), 'yyyy-MM-dd')).reduce((s, v) => s + v.totalVisits, 0);
  const thisWeekVisits = visits.filter(v => parseISO(v.date) >= subDays(new Date(), 7)).reduce((s, v) => s + v.totalVisits, 0);
  const totalOutgoing = outgoing.length;
  const pendingIncoming = incoming.filter(r => r.status === 'pending' || r.status === 'in-transit').length;
  const acceptedIncoming = incoming.filter(r => r.status === 'accepted' || r.status === 'in-treatment').length;
  const urgentOutgoing = outgoing.filter(r => r.urgency === 'urgent' || r.urgency === 'emergency').length;

  // Recent outgoing referrals
  const recentOutgoing = [...outgoing].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 5);

  // Recent daily visits
  const recentVisits = [...visits].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7);

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div>
        <h1 className="text-2xl font-bold">{stationName}</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Your referral workflow dashboard. Log visits, send referrals, and manage incoming patients.
        </p>
      </div>

      {/* Quick Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ActionCard
          title="Log Daily Visits"
          subtitle="Record patient counts for today"
          icon={Users}
          gradient="from-sky-500 to-sky-600"
          onClick={onLogVisits}
        />
        <ActionCard
          title="Send Referral"
          subtitle="Refer a patient to another facility"
          icon={Send}
          gradient="from-primary to-primary/80"
          onClick={onSendReferral}
        />
        <ActionCard
          title="Counter-Referral"
          subtitle="Manage incoming patients"
          icon={ClipboardList}
          gradient="from-emerald-500 to-emerald-600"
          onClick={onCounterReferral}
        />
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Today's Visits"
          value={todayVisits}
          icon={Calendar}
          iconColor="text-sky-600"
          bgColor="bg-sky-50"
          trend={thisWeekVisits > 0 ? `${thisWeekVisits} this week` : undefined}
        />
        <StatCard
          label="Referrals Sent"
          value={totalOutgoing}
          icon={Send}
          iconColor="text-primary"
          bgColor="bg-primary/10"
          trend={urgentOutgoing > 0 ? `${urgentOutgoing} urgent` : undefined}
          trendColor="text-amber-600"
        />
        <StatCard
          label="Incoming"
          value={pendingIncoming}
          icon={ArrowRightLeft}
          iconColor="text-amber-600"
          bgColor="bg-amber-50"
          trend={acceptedIncoming > 0 ? `${acceptedIncoming} active` : undefined}
          trendColor="text-emerald-600"
        />
        <StatCard
          label="In Treatment"
          value={acceptedIncoming}
          icon={Stethoscope}
          iconColor="text-emerald-600"
          bgColor="bg-emerald-50"
        />
      </div>

      {loading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Referrals Sent */}
          <div className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <Send className="w-4 h-4 text-primary" />
                Recent Referrals Sent
              </h3>
              <button onClick={onSendReferral} className="text-xs text-primary font-medium hover:underline">
                Send New
              </button>
            </div>
            {recentOutgoing.length > 0 ? (
              <div className="space-y-2">
                {recentOutgoing.map(r => (
                  <div key={r.id} className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors">
                    <div className={`w-2 h-2 rounded-full ${
                      r.urgency === 'emergency' ? 'bg-red-500' :
                      r.urgency === 'urgent' ? 'bg-amber-500' : 'bg-blue-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.patientName}</p>
                      <p className="text-xs text-muted-foreground">
                        To: {r.destinationStationName} · {r.modeOfTransport}
                      </p>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                      r.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                      r.status === 'rejected' ? 'bg-red-100 text-red-700' :
                      'bg-amber-100 text-amber-700'
                    }`}>
                      {r.status}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Send} message="No referrals sent yet" hint="Send your first referral from the Send Referral tab" />
            )}
          </div>

          {/* Recent Visit Log */}
          <div className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-sky-500" />
                Recent Visit Logs
              </h3>
              <button onClick={onLogVisits} className="text-xs text-sky-600 font-medium hover:underline">
                Log Visits
              </button>
            </div>
            {recentVisits.length > 0 ? (
              <div className="space-y-2">
                {recentVisits.map(v => (
                  <div key={v._id} className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${isToday(parseISO(v.date)) ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
                      <div>
                        <p className="text-sm font-medium">
                          {format(parseISO(v.date), 'EEE, MMM d')}
                          {isToday(parseISO(v.date)) && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full ml-2 font-medium">Today</span>}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm font-bold">{v.totalVisits} <span className="text-xs font-normal text-muted-foreground">patients</span></p>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState icon={Calendar} message="No visits logged yet" hint="Log today's patient count from the Daily Visits tab" />
            )}
          </div>
        </div>
      )}

      {/* Incoming Patients Alert */}
      {!loading && pendingIncoming > 0 && (
        <button
          onClick={onCounterReferral}
          className="w-full flex items-center gap-4 p-4 rounded-xl bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors text-left"
        >
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-amber-800">{pendingIncoming} patient{pendingIncoming > 1 ? 's' : ''} awaiting acceptance</p>
            <p className="text-xs text-amber-600">Patients referred to {stationName} need to be accepted</p>
          </div>
          <ChevronRight className="w-5 h-5 text-amber-600" />
        </button>
      )}

      {/* All Caught Up */}
      {!loading && pendingIncoming === 0 && incoming.length > 0 && (
        <div className="flex items-center gap-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200">
          <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
          <div>
            <p className="font-semibold text-emerald-800">All caught up</p>
            <p className="text-xs text-emerald-600">No pending incoming patients. {acceptedIncoming} currently in treatment.</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ─── */

function ActionCard({ title, subtitle, icon: Icon, gradient, onClick }: {
  title: string; subtitle: string; icon: typeof Users; gradient: string; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`group text-left bg-gradient-to-r ${gradient} rounded-xl p-5 text-white cursor-pointer hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] transition-all duration-200`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="text-white/70 text-xs font-medium uppercase tracking-wide">Quick Action</p>
          <h3 className="text-lg font-bold mt-1 group-hover:underline underline-offset-2">{title}</h3>
          <p className="text-white/70 text-xs mt-1">{subtitle}</p>
        </div>
        <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center group-hover:bg-white/30 transition-colors">
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </button>
  );
}

function StatCard({ label, value, icon: Icon, iconColor, bgColor, trend, trendColor }: {
  label: string; value: number; icon: typeof Users; iconColor: string; bgColor: string;
  trend?: string; trendColor?: string;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-2">
        <div className={`w-8 h-8 rounded-lg ${bgColor} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
        {trend && <span className={`text-[10px] font-medium ${trendColor || 'text-muted-foreground'}`}>{trend}</span>}
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function EmptyState({ icon: Icon, message, hint }: { icon: typeof Users; message: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
      <Icon className="w-10 h-10 mb-3 opacity-30" />
      <p className="text-sm font-medium">{message}</p>
      <p className="text-xs mt-1">{hint}</p>
    </div>
  );
}
