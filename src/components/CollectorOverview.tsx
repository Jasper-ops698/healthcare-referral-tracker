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
  Bell, BellRing, Eye, ShieldAlert,
} from 'lucide-react';
import { format, subDays, isToday, parseISO } from 'date-fns';
import {
  getDailyVisits, getOutgoingReferrals, getIncomingReferrals,
  getChpAlerts, acknowledgeChpAlert, resolveChpAlert, getChpAlertJourney,
} from '@/lib/apiClient';
import type { ReferralV2 } from '@/types';
import { toast } from 'sonner';

interface Props {
  stationId: string;
  stationName: string;
  collectorId: string;
  onLogVisits: () => void;
  onSendReferral: () => void;
  onCounterReferral: () => void;
  onCreateFollowUpReferral?: (data: {
    patientName: string;
    patientAge?: number;
    patientGender?: string;
    patientPhone?: string;
    initialDiagnosis: string;
    reasonForReferral: string;
    urgency?: string;
    previousReferralId?: string;
    chpAlertId?: string;
    notes?: string;
  }) => void;
}

interface DailyVisit {
  _id: string;
  date: string;
  totalVisits: number;
}

export default function CollectorOverview({
  stationId, stationName, collectorId, onLogVisits, onSendReferral, onCounterReferral,
  onCreateFollowUpReferral,
}: Props) {
  const [visits, setVisits] = useState<DailyVisit[]>([]);
  const [outgoing, setOutgoing] = useState<ReferralV2[]>([]);
  const [incoming, setIncoming] = useState<ReferralV2[]>([]);
  const [loading, setLoading] = useState(true);

  // CHP Alert state (Phase C)
  const [chpAlerts, setChpAlerts] = useState<any[]>([]);
  const [alertCounts, setAlertCounts] = useState({ total: 0, open: 0, emergency: 0, urgent: 0 });
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [selectedAlert, setSelectedAlert] = useState<any>(null);
  const [journeyData, setJourneyData] = useState<any>(null);
  const [showJourney, setShowJourney] = useState(false);
  const [journeyLoading, setJourneyLoading] = useState(false);

  useEffect(() => {
    loadData();
    loadChpAlerts();
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

  const loadChpAlerts = async () => {
    setAlertsLoading(true);
    try {
      const res = await getChpAlerts();
      if (res.success && res.data) {
        const data = res.data as any;
        setChpAlerts(data.alerts || []);
        setAlertCounts(data.counts || { total: 0, open: 0, emergency: 0, urgent: 0 });
      }
    } catch (e) { console.error('CHP alerts load failed:', e); }
    finally { setAlertsLoading(false); }
  };

  const handleAckAlert = async (alertId: string) => {
    try {
      const res = await acknowledgeChpAlert(alertId);
      if (res.success) {
        toast.success('Alert acknowledged');
        loadChpAlerts();
      } else {
        toast.error(res.error?.message || 'Failed to acknowledge');
      }
    } catch { toast.error('Network error'); }
  };

  const handleResolveAlert = async (alertId: string) => {
    try {
      const res = await resolveChpAlert(alertId, { resolutionAction: 'monitored' });
      if (res.success) {
        toast.success('Alert resolved');
        loadChpAlerts();
      } else {
        toast.error(res.error?.message || 'Failed to resolve');
      }
    } catch { toast.error('Network error'); }
  };

  const handleViewJourney = async (alertId: string) => {
    setJourneyLoading(true);
    setShowJourney(true);
    try {
      const res = await getChpAlertJourney(alertId);
      if (res.success && res.data) {
        setJourneyData((res.data as any).journey);
        setSelectedAlert((res.data as any).alert);
      } else {
        toast.error('Failed to load patient journey');
      }
    } catch { toast.error('Network error'); }
    setJourneyLoading(false);
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

      {/* CHP Alerts Banner (Phase C) */}
      {!alertsLoading && alertCounts.open > 0 && (
        <div className={`rounded-xl border p-4 ${
          alertCounts.emergency > 0
            ? 'bg-red-50 border-red-200'
            : alertCounts.urgent > 0
            ? 'bg-amber-50 border-amber-200'
            : 'bg-blue-50 border-blue-200'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
              alertCounts.emergency > 0 ? 'bg-red-100' : alertCounts.urgent > 0 ? 'bg-amber-100' : 'bg-blue-100'
            }`}>
              <BellRing className={`w-5 h-5 ${
                alertCounts.emergency > 0 ? 'text-red-600' : alertCounts.urgent > 0 ? 'text-amber-600' : 'text-blue-600'
              }`} />
            </div>
            <div className="flex-1">
              <p className={`font-semibold text-sm ${
                alertCounts.emergency > 0 ? 'text-red-800' : alertCounts.urgent > 0 ? 'text-amber-800' : 'text-blue-800'
              }`}>
                {alertCounts.emergency > 0 && <span className="mr-1">{alertCounts.emergency} emergency</span>}
                {alertCounts.urgent > 0 && <span className="mr-1">{alertCounts.urgent} urgent</span>}
                {alertCounts.open - alertCounts.emergency - alertCounts.urgent > 0 && (
                  <span>{alertCounts.open - alertCounts.emergency - alertCounts.urgent} routine</span>
                )}
                {' '}CHP alert{alertCounts.open > 1 ? 's' : ''} need{alertCounts.open === 1 ? 's' : ''} attention
              </p>
              <p className={`text-xs ${
                alertCounts.emergency > 0 ? 'text-red-600' : alertCounts.urgent > 0 ? 'text-amber-600' : 'text-blue-600'
              }`}>
                CHPs flagged patients needing medical follow-up. Review and take action below.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* CHP Alerts List */}
      {!alertsLoading && chpAlerts.filter((a: any) => a.status === 'open').length > 0 && (
        <div className="bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-red-500" />
              CHP Alerts — Patients Needing Care
            </h3>
            <span className="text-xs text-muted-foreground">
              {chpAlerts.filter((a: any) => a.status === 'open').length} open
            </span>
          </div>
          <div className="space-y-2">
            {chpAlerts
              .filter((a: any) => a.status === 'open')
              .sort((a: any, b: any) => {
                const priorityOrder = { emergency: 0, urgent: 1, routine: 2 };
                return priorityOrder[a.priority as keyof typeof priorityOrder] - priorityOrder[b.priority as keyof typeof priorityOrder];
              })
              .map((alert: any) => (
                <div
                  key={alert._id}
                  className={`p-4 rounded-lg border ${
                    alert.priority === 'emergency'
                      ? 'bg-red-50 border-red-200'
                      : alert.priority === 'urgent'
                      ? 'bg-amber-50 border-amber-200'
                      : 'bg-blue-50 border-blue-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-2 h-2 rounded-full mt-2 shrink-0 ${
                      alert.priority === 'emergency' ? 'bg-red-500' :
                      alert.priority === 'urgent' ? 'bg-amber-500' : 'bg-blue-400'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-sm font-semibold">{alert.patientName}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                          alert.priority === 'emergency' ? 'bg-red-200 text-red-700' :
                          alert.priority === 'urgent' ? 'bg-amber-200 text-amber-700' :
                          'bg-blue-200 text-blue-700'
                        }`}>
                          {alert.priority}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mb-2">{alert.message}</p>
                      {alert.chpSymptomsObserved && (
                        <p className="text-xs text-red-600 mb-2">
                          <strong>Symptoms:</strong> {alert.chpSymptomsObserved}
                        </p>
                      )}
                      {alert.chpRecommendedAction && (
                        <p className="text-xs text-muted-foreground mb-3">
                          <strong>CHP recommends:</strong> {alert.chpRecommendedAction.replace(/-/g, ' ')}
                        </p>
                      )}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => handleViewJourney(alert._id)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-border hover:bg-muted text-xs font-medium transition-colors"
                        >
                          <Eye className="w-3 h-3" /> View Journey
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAckAlert(alert._id)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-border hover:bg-muted text-xs font-medium transition-colors"
                        >
                          Acknowledge
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResolveAlert(alert._id)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700 text-xs font-medium transition-colors"
                        >
                          <CheckCircle2 className="w-3 h-3" /> Resolve
                        </button>
                      </div>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">
                      {format(new Date(alert.createdAt), 'MMM d')}
                    </span>
                  </div>
                </div>
              ))}
          </div>
        </div>
      )}

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

      {/* Patient Journey Modal (Phase C) */}
      {showJourney && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowJourney(false)}>
          <div className="bg-card rounded-xl border border-border shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-card border-b border-border px-5 py-4 flex items-center justify-between rounded-t-xl z-10">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <ClipboardList className="w-5 h-5 text-primary" />
                Patient Journey
              </h3>
              <button onClick={() => setShowJourney(false)} className="text-sm text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors">
                Close
              </button>
            </div>

            {journeyLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : journeyData ? (
              <div className="p-5 space-y-4">
                {/* Patient header */}
                <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                  <p className="text-xl font-bold">{journeyData.patientName}</p>
                  <p className="text-sm text-muted-foreground">ID: {journeyData.patientId}</p>
                  {selectedAlert?.chpRecommendedAction && (
                    <div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-100 text-red-700 text-sm font-medium">
                      <ShieldAlert className="w-4 h-4" />
                      CHP recommends: {selectedAlert.chpRecommendedAction.replace(/-/g, ' ')}
                    </div>
                  )}
                </div>

                {/* Timeline */}
                {journeyData.timeline?.length > 0 && (
                  <div className="relative pl-6 space-y-4">
                    {/* Vertical line */}
                    <div className="absolute left-[11px] top-2 bottom-2 w-0.5 bg-border" />

                    {journeyData.timeline.map((event: any, i: number) => (
                      <div key={i} className="relative">
                        {/* Dot */}
                        <div className={`absolute -left-6 w-5 h-5 rounded-full border-2 bg-card flex items-center justify-center ${
                          event.stage === 'chp-response' ? 'border-red-500' :
                          event.stage === 'referral-created' ? 'border-primary' :
                          event.stage === 'counter-referral' ? 'border-emerald-500' :
                          'border-amber-500'
                        }`}>
                          <div className={`w-2 h-2 rounded-full ${
                            event.stage === 'chp-response' ? 'bg-red-500' :
                            event.stage === 'referral-created' ? 'bg-primary' :
                            event.stage === 'counter-referral' ? 'bg-emerald-500' :
                            'bg-amber-500'
                          }`} />
                        </div>

                        <div className={`p-3 rounded-lg border ${
                          event.stage === 'chp-response' ? 'bg-red-50 border-red-200' : 'bg-muted/30 border-border'
                        }`}>
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-sm font-semibold">{event.title}</p>
                            <span className="text-[10px] text-muted-foreground">
                              {format(new Date(event.date), 'MMM d, yyyy · h:mm a')}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mb-1">{event.description}</p>
                          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span>By: {event.actor}</span>
                            <span>·</span>
                            <span>At: {event.location}</span>
                          </div>
                          {event.details && (
                            <div className="mt-2 p-2 rounded bg-white/60 text-xs space-y-0.5">
                              {event.details.urgency && (
                                <p><span className="text-muted-foreground">Urgency:</span> <span className="font-medium">{event.details.urgency}</span></p>
                              )}
                              {event.details.reasonForReferral && (
                                <p><span className="text-muted-foreground">Reason:</span> <span className="font-medium">{event.details.reasonForReferral}</span></p>
                              )}
                              {event.details.finalDiagnosis && (
                                <p><span className="text-muted-foreground">Diagnosis:</span> <span className="font-medium">{event.details.finalDiagnosis}</span></p>
                              )}
                              {event.details.treatmentProvided && (
                                <p><span className="text-muted-foreground">Treatment:</span> <span className="font-medium">{event.details.treatmentProvided}</span></p>
                              )}
                              {event.details.followUpInstructions && (
                                <p><span className="text-muted-foreground">Instructions:</span> <span className="font-medium">{event.details.followUpInstructions}</span></p>
                              )}
                              {event.details.chpSymptomsObserved && (
                                <p className="text-red-600"><span className="text-red-400">Symptoms observed:</span> <span className="font-medium">{event.details.chpSymptomsObserved}</span></p>
                              )}
                              {event.details.chpNeedsMedicalAttention && (
                                <p className="text-red-600 font-medium">⚠ CHP flagged: Needs medical attention</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Action buttons */}
                {selectedAlert?.status === 'open' && (
                  <div className="flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => {
                        handleAckAlert(selectedAlert._id);
                        setShowJourney(false);
                      }}
                      className="flex-1 px-4 py-2.5 rounded-lg bg-muted hover:bg-muted/80 text-sm font-medium transition-colors"
                    >
                      Acknowledge
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (onCreateFollowUpReferral && selectedAlert && journeyData) {
                          onCreateFollowUpReferral({
                            patientName: journeyData.patientName,
                            initialDiagnosis: `Follow-up: ${selectedAlert.chpSymptomsObserved || 'CHP recommended medical attention'}`,
                            reasonForReferral: `CHP follow-up: ${selectedAlert.chpRecommendedAction?.replace(/-/g, ' ') || 'medical attention recommended'}`,
                            urgency: selectedAlert.priority === 'emergency' ? 'emergency' : selectedAlert.priority === 'urgent' ? 'urgent' : 'routine',
                            previousReferralId: selectedAlert.referralId,
                            chpAlertId: selectedAlert._id,
                            notes: `CHP ${selectedAlert.chpName} observed: ${selectedAlert.chpSymptomsObserved || 'Patient needs care'}`,
                          });
                          setShowJourney(false);
                        }
                      }}
                      className="flex-1 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-sm font-medium transition-colors flex items-center justify-center gap-2"
                    >
                      <Send className="w-4 h-4" /> Create Follow-up Referral
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center py-16 text-muted-foreground">
                <p>No journey data available</p>
              </div>
            )}
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
