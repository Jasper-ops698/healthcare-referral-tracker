/**
 * DailyVisitLog — Simple facility visit counter
 *
 * Since the facility (Bomani, Kilifi General, etc.) already registers
 * patients in their own system, the collector only needs to log the
 * NUMBER of patients seen at the facility each day.
 *
 * This feeds into admin analytics for "Activity by Station" reporting.
 */

import { useState, useEffect } from 'react';
import {
  Users, Calendar, Save, TrendingUp, Clock,
  Trash2, Pencil, RotateCcw
} from 'lucide-react';
import { format, subDays, isToday, parseISO } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface DailyVisit {
  id: string;
  date: string;        // ISO date string YYYY-MM-DD
  totalVisits: number;
  maleVisits: number;
  femaleVisits: number;
  childVisits: number; // under 5 years
  stationId: string;
  stationName: string;
  collectorId: string;
  collectorName: string;
  notes?: string;
  createdAt: Date;
  updatedAt?: Date;
}

const STORAGE_KEY = 'healthtrack_daily_visits';

function loadVisits(): DailyVisit[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return parsed.map((v: any) => ({
      ...v,
      createdAt: new Date(v.createdAt),
      updatedAt: v.updatedAt ? new Date(v.updatedAt) : undefined,
    }));
  } catch { return []; }
}

function saveVisits(visits: DailyVisit[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(visits));
}

export default function DailyVisitLog() {
  const { user } = useAuth();
  const [visits, setVisits] = useState<DailyVisit[]>([]);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [totalVisits, setTotalVisits] = useState('');
  const [maleVisits, setMaleVisits] = useState('');
  const [femaleVisits, setFemaleVisits] = useState('');
  const [childVisits, setChildVisits] = useState('');
  const [notes, setNotes] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const stationId = user?.stationId || '';
  const stationName = user?.stationName || 'Unknown Station';
  const collectorId = user?.id || '';
  const collectorName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();

  // Load visits on mount
  useEffect(() => {
    setVisits(loadVisits());
  }, []);

  // Load today's entry if exists
  const todayEntry = visits.find(v => v.date === selectedDate && v.stationId === stationId);

  // Pre-fill when editing
  useEffect(() => {
    if (todayEntry) {
      setTotalVisits(String(todayEntry.totalVisits));
      setMaleVisits(String(todayEntry.maleVisits));
      setFemaleVisits(String(todayEntry.femaleVisits));
      setChildVisits(String(todayEntry.childVisits));
      setNotes(todayEntry.notes || '');
      setEditingId(todayEntry.id);
    } else {
      setTotalVisits('');
      setMaleVisits('');
      setFemaleVisits('');
      setChildVisits('');
      setNotes('');
      setEditingId(null);
    }
  }, [selectedDate, todayEntry]);

  // Auto-calculate total from gender breakdown
  const computedTotal = (parseInt(maleVisits) || 0) + (parseInt(femaleVisits) || 0);
  const displayTotal = totalVisits || (computedTotal > 0 ? String(computedTotal) : '');

  const handleSave = () => {
    const total = parseInt(totalVisits) || computedTotal || 0;
    if (total <= 0) {
      toast.error('Please enter the number of patients seen');
      return;
    }

    setSaving(true);

    const visit: DailyVisit = {
      id: editingId || `visit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      date: selectedDate,
      totalVisits: total,
      maleVisits: parseInt(maleVisits) || 0,
      femaleVisits: parseInt(femaleVisits) || 0,
      childVisits: parseInt(childVisits) || 0,
      stationId,
      stationName,
      collectorId,
      collectorName,
      notes: notes || undefined,
      createdAt: editingId ? (visits.find(v => v.id === editingId)?.createdAt || new Date()) : new Date(),
      updatedAt: new Date(),
    };

    setVisits(prev => {
      const filtered = prev.filter(v => v.id !== visit.id);
      const updated = [...filtered, visit].sort((a, b) => b.date.localeCompare(a.date));
      saveVisits(updated);
      return updated;
    });

    toast.success(editingId ? 'Visit log updated' : 'Visit log saved');
    setSaving(false);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this visit log?')) return;
    setVisits(prev => {
      const updated = prev.filter(v => v.id !== id);
      saveVisits(updated);
      return updated;
    });
    toast.success('Visit log deleted');
  };

  const quickFillYesterday = () => {
    const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
    const yestEntry = visits.find(v => v.date === yesterday && v.stationId === stationId);
    if (yestEntry) {
      setTotalVisits(String(yestEntry.totalVisits));
      setMaleVisits(String(yestEntry.maleVisits));
      setFemaleVisits(String(yestEntry.femaleVisits));
      setChildVisits(String(yestEntry.childVisits));
    }
  };

  // Stats
  const stationVisits = visits.filter(v => v.stationId === stationId);
  const todayVisits = stationVisits.filter(v => v.date === format(new Date(), 'yyyy-MM-dd'));
  const thisWeekVisits = stationVisits.filter(v => {
    const d = parseISO(v.date);
    return d >= subDays(new Date(), 7);
  });
  const totalThisWeek = thisWeekVisits.reduce((s, v) => s + v.totalVisits, 0);
  const avgDaily = thisWeekVisits.length > 0 ? Math.round(totalThisWeek / thisWeekVisits.length) : 0;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card rounded-xl p-4 border border-border">
          <div className="flex items-center gap-2 mb-1">
            <Users className="w-4 h-4 text-primary" />
            <span className="text-xs text-muted-foreground">Today</span>
          </div>
          <p className="text-2xl font-bold">{todayVisits.reduce((s, v) => s + v.totalVisits, 0)}</p>
          <p className="text-xs text-muted-foreground">patients seen</p>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            <span className="text-xs text-muted-foreground">This Week</span>
          </div>
          <p className="text-2xl font-bold">{totalThisWeek}</p>
          <p className="text-xs text-muted-foreground">total visits</p>
        </div>
        <div className="bg-card rounded-xl p-4 border border-border">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-amber-500" />
            <span className="text-xs text-muted-foreground">Daily Avg</span>
          </div>
          <p className="text-2xl font-bold">{avgDaily}</p>
          <p className="text-xs text-muted-foreground">this week</p>
        </div>
      </div>

      {/* Entry Form */}
      <div className="bg-card rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            {editingId ? 'Edit Visit Log' : 'Log Patient Visits'}
          </h3>
          {isToday(parseISO(selectedDate)) && (
            <button
              onClick={quickFillYesterday}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              title="Copy yesterday's numbers"
            >
              <RotateCcw className="w-3 h-3" /> Copy yesterday
            </button>
          )}
        </div>

        {/* Date */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border text-sm"
          />
        </div>

        {/* Total */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            Total Patients Seen *
          </label>
          <input
            type="number"
            min="0"
            value={displayTotal}
            onChange={e => setTotalVisits(e.target.value)}
            className="w-full sm:w-48 px-3 py-2 rounded-lg border border-border text-sm text-lg font-semibold"
            placeholder="e.g. 45"
          />
          <p className="text-xs text-muted-foreground mt-1">
            Auto-calculated from Male + Female below, or enter total directly
          </p>
        </div>

        {/* Gender Breakdown */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-blue-500 inline-block" /> Male
            </label>
            <input
              type="number"
              min="0"
              value={maleVisits}
              onChange={e => setMaleVisits(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border text-sm"
              placeholder="0"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <span className="w-3 h-3 rounded-full bg-pink-500 inline-block" /> Female
            </label>
            <input
              type="number"
              min="0"
              value={femaleVisits}
              onChange={e => setFemaleVisits(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border text-sm"
              placeholder="0"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <Users className="w-3 h-3 text-amber-500" /> Under 5
            </label>
            <input
              type="number"
              min="0"
              value={childVisits}
              onChange={e => setChildVisits(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-border text-sm"
              placeholder="0"
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes (optional)</label>
          <textarea
            rows={2}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border text-sm"
            placeholder="Any notes about today's patient volume..."
          />
        </div>

        {/* Save */}
        <button
          onClick={handleSave}
          disabled={saving || !displayTotal || parseInt(displayTotal) <= 0}
          className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {saving ? (
            <><RotateCcw className="w-4 h-4 animate-spin" /> Saving...</>
          ) : editingId ? (
            <><Pencil className="w-4 h-4" /> Update Visit Log</>
          ) : (
            <><Save className="w-4 h-4" /> Save Visit Log</>
          )}
        </button>
      </div>

      {/* History */}
      {stationVisits.length > 0 && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-semibold">Visit History — {stationName}</h3>
          </div>
          <div className="divide-y divide-border">
            {stationVisits.slice(0, 14).map(visit => (
              <div key={visit.id} className="px-4 py-3 flex items-center justify-between hover:bg-muted/30">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${isToday(parseISO(visit.date)) ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
                  <div>
                    <p className="text-sm font-medium">
                      {format(parseISO(visit.date), 'EEE, MMM d, yyyy')}
                      {isToday(parseISO(visit.date)) && <span className="text-xs text-emerald-600 ml-2 font-normal">Today</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {visit.totalVisits} visits
                      {visit.maleVisits > 0 && ` · ${visit.maleVisits}M`}
                      {visit.femaleVisits > 0 && ` · ${visit.femaleVisits}F`}
                      {visit.childVisits > 0 && ` · ${visit.childVisits} <5y`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setSelectedDate(visit.date); }}
                    className="p-1.5 rounded-md hover:bg-muted text-muted-foreground"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(visit.id)}
                    className="p-1.5 rounded-md hover:bg-red-50 text-muted-foreground hover:text-red-500"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          {stationVisits.length > 14 && (
            <p className="text-center text-xs text-muted-foreground py-2 border-t border-border">
              Showing last 14 days
            </p>
          )}
        </div>
      )}
    </div>
  );
}
