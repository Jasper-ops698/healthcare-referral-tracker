/**
 * IncomingReferrals — View for collectors at destination (referral centers)
 *
 * Features:
 *   - Lists referrals incoming to the collector's station
 *   - Filter by status (pending, accepted, in-treatment, etc.)
 *   - Accept incoming referrals
 *   - Initiate counter-referral for accepted patients
 *   - Search by patient name or ID
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Inbox, Search, CheckCircle, Clock,
  Stethoscope, User, Phone, MapPin, Ambulance,
  ChevronRight, RefreshCw, ClipboardList, X
} from 'lucide-react';
import type { ReferralV2 } from '@/types';
import CounterReferralForm from './CounterReferralForm';

interface IncomingReferralsProps {
  stationId: string;
  stationName: string;
  collectorId: string;
  collectorName: string;
}

type StatusFilter = 'all' | 'pending' | 'in-transit' | 'accepted' | 'in-treatment' | 'counter-referral-created' | 'completed' | 'rejected';

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: 'Pending', color: 'bg-slate-100 text-slate-700', icon: Clock },
  'in-transit': { label: 'In Transit', color: 'bg-blue-100 text-blue-700', icon: Ambulance },
  accepted: { label: 'Accepted', color: 'bg-emerald-100 text-emerald-700', icon: CheckCircle },
  'in-treatment': { label: 'In Treatment', color: 'bg-amber-100 text-amber-700', icon: Stethoscope },
  'counter-referral-created': { label: 'Counter-Referral', color: 'bg-purple-100 text-purple-700', icon: ClipboardList },
  completed: { label: 'Completed', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  rejected: { label: 'Rejected', color: 'bg-red-100 text-red-700', icon: X },
};

const URGENCY_BADGE = {
  emergency: 'bg-red-500 text-white',
  urgent: 'bg-amber-500 text-white',
  routine: 'bg-blue-400 text-white',
};

export default function IncomingReferrals({ stationId, stationName, collectorId, collectorName }: IncomingReferralsProps) {
  const [referrals, setReferrals] = useState<ReferralV2[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [selectedReferral, setSelectedReferral] = useState<ReferralV2 | null>(null);
  const [showCounterForm, setShowCounterForm] = useState(false);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);

  const fetchReferrals = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const jwtToken = localStorage.getItem('healthtrack_jwt_token');
      const statusParam = statusFilter !== 'all' ? `?status=${statusFilter}` : '';
      const headers: Record<string, string> = {};
      if (jwtToken) headers.Authorization = `Bearer ${jwtToken}`;
      const res = await fetch(`/api/v1/referrals-v2/incoming/${stationId}${statusParam}`, { headers });
      const result = await res.json();
      if (result.success) {
        setReferrals(result.data?.referrals || []);
      } else {
        setError(result.error || 'Failed to load referrals');
      }
    } catch (err: any) {
      setError(err.message || 'Network error');
    } finally {
      setLoading(false);
    }
  }, [stationId, statusFilter]);

  useEffect(() => {
    fetchReferrals();
  }, [fetchReferrals]);

  const handleAccept = async (referralId: string) => {
    setAcceptingId(referralId);
    try {
      const jwtToken = localStorage.getItem('healthtrack_jwt_token');
      const res = await fetch(`/api/v1/referrals-v2/${referralId}/accept`, {
        method: 'POST',
        headers: { ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}), 'Content-Type': 'application/json' },
      });
      const result = await res.json();
      if (result.success) {
        setReferrals(prev => prev.map(r => r.id === referralId ? { ...r, status: 'accepted' as const, acceptedAt: new Date() } : r));
      }
    } catch (err: any) {
      console.error('Accept failed:', err);
    } finally {
      setAcceptingId(null);
    }
  };

  const handleCounterSubmit = async (data: Partial<import('@/types').CounterReferral>) => {
    const jwtToken = localStorage.getItem('healthtrack_jwt_token');
    const res = await fetch('/api/v1/counter-referrals', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwtToken}` || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });
    const result = await res.json();
    if (result.success) {
      setShowCounterForm(false);
      setSelectedReferral(null);
      fetchReferrals();
    }
    return result;
  };

  const filtered = referrals.filter(r => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return r.patientName.toLowerCase().includes(q) || r.patientId.toLowerCase().includes(q);
  });

  // Stats
  const stats = {
    total: referrals.length,
    pending: referrals.filter(r => r.status === 'pending' || r.status === 'in-transit').length,
    accepted: referrals.filter(r => r.status === 'accepted' || r.status === 'in-treatment').length,
    completed: referrals.filter(r => r.status === 'counter-referral-created' || r.status === 'completed').length,
  };

  if (showCounterForm && selectedReferral) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <button
            onClick={() => { setShowCounterForm(false); setSelectedReferral(null); }}
            className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <ChevronRight className="w-4 h-4 rotate-180" /> Back to Incoming
          </button>
        </div>
        <CounterReferralForm
          referral={selectedReferral}
          onSubmit={handleCounterSubmit}
          collectorId={collectorId}
          collectorName={collectorName}
          stationId={stationId}
          stationName={stationName}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Incoming', value: stats.total, icon: Inbox },
          { label: 'Pending/Transit', value: stats.pending, icon: Clock, color: 'text-amber-600' },
          { label: 'Active', value: stats.accepted, icon: Stethoscope, color: 'text-blue-600' },
          { label: 'Completed', value: stats.completed, icon: CheckCircle, color: 'text-emerald-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-card rounded-xl p-3 border border-border">
            <div className="flex items-center gap-2">
              <Icon className={`w-4 h-4 ${color || 'text-muted-foreground'}`} />
              <span className="text-xs text-muted-foreground">{label}</span>
            </div>
            <p className="text-2xl font-bold mt-1">{value}</p>
          </div>
        ))}
      </div>

      {/* Search & Filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by patient name or ID..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-border text-sm"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            className="px-3 py-2 rounded-lg border border-border text-sm"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="in-transit">In Transit</option>
            <option value="accepted">Accepted</option>
            <option value="in-treatment">In Treatment</option>
            <option value="counter-referral-created">Counter-Referral</option>
          </select>
          <button
            onClick={fetchReferrals}
            className="p-2 rounded-lg border border-border hover:bg-muted transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Referral List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <div className="text-center py-8 text-red-500 text-sm">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Inbox className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No incoming referrals found</p>
          <p className="text-xs mt-1">Referrals sent to {stationName} will appear here</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(referral => {
            const statusConfig = STATUS_CONFIG[referral.status] || STATUS_CONFIG.pending;
            const StatusIcon = statusConfig.icon;
            return (
              <div
                key={referral.id}
                className="bg-card rounded-xl border border-border p-4 hover:border-primary/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <span className="font-semibold text-sm">{referral.patientName}</span>
                      <span className="text-xs text-muted-foreground font-mono">({referral.patientId})</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${URGENCY_BADGE[referral.urgency]}`}>
                        {referral.urgency}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full ${statusConfig.color}`}>
                        <StatusIcon className="w-3 h-3" /> {statusConfig.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1"><span className="font-medium">{referral.patientAge}y</span> / {referral.patientGender}</span>
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {referral.patientPhone}</span>
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> From: {referral.sourceStationName}</span>
                      <span className="flex items-center gap-1"><Ambulance className="w-3 h-3" /> {referral.modeOfTransport.replace('-', ' ')}</span>
                    </div>

                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground">Initial: <span className="text-amber-700 font-medium">{referral.initialDiagnosis}</span></p>
                      {referral.aiSuggestedCategory && (
                        <p className="text-xs text-muted-foreground mt-0.5">AI: {referral.aiSuggestedCategory} ({Math.round((referral.aiConfidence || 0) * 100)}%)</p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 shrink-0">
                    {(referral.status === 'pending' || referral.status === 'in-transit') && (
                      <button
                        onClick={() => handleAccept(referral.id)}
                        disabled={acceptingId === referral.id}
                        className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-medium hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1"
                      >
                        {acceptingId === referral.id ? (
                          <RefreshCw className="w-3 h-3 animate-spin" />
                        ) : (
                          <CheckCircle className="w-3 h-3" />
                        )}
                        Accept
                      </button>
                    )}
                    {(referral.status === 'accepted' || referral.status === 'in-treatment') && (
                      <button
                        onClick={() => { setSelectedReferral(referral); setShowCounterForm(true); }}
                        className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 flex items-center gap-1"
                      >
                        <ClipboardList className="w-3 h-3" />
                        Counter-Referral
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
