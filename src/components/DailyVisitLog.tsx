/**
 * DailyVisitLog v2 — Upgraded with visual progress bars and polished UX
 *
 * Since the facility already registers patients, the collector only logs
 * the NUMBER of patients seen at the facility each day.
 */

import { useState, useEffect } from 'react';
import {
  Users, Calendar, Save, TrendingUp, Clock,
  Trash2, Pencil, RotateCcw, BarChart3, ArrowUpRight, ArrowDownRight,
  Baby, CircleUser,
} from 'lucide-react';
import { format, subDays, isToday, parseISO } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface DailyVisit {
  id: string;
  date: string;
  totalVisits: number;
  maleVisits: number;
  femaleVisits: number;
  childVisits: number;
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

  useEffect(() => { setVisits(loadVisits()); }, []);

  const todayEntry = visits.find(v => v.date === selectedDate && v.stationId === stationId);

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

  const computedTotal = (parseInt(maleVisits) || 0) + (parseInt(femaleVisits) || 0);
  const displayTotal = totalVisits || (computedTotal > 0 ? String(computedTotal) : '');

  const handleSave = () => {
    const total = parseInt(totalVisits) || computedTotal || 0;
    if (total <= 0) { toast.error('Please enter the number of patients seen'); return; }
    setSaving(true);
    const visit: DailyVisit = {
      id: editingId || `visit_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      date: selectedDate, totalVisits: total,
      maleVisits: parseInt(maleVisits) || 0, femaleVisits: parseInt(femaleVisits) || 0,
      childVisits: parseInt(childVisits) || 0,
      stationId, stationName, collectorId, collectorName,
      notes: notes || undefined,
      createdAt: editingId ? (visits.find(v => v.id === editingId)?.createdAt || new Date()) : new Date(),
      updatedAt: new Date(),
    };
    setVisits(prev => {
      const updated = [...prev.filter(v => v.id !== visit.id), visit].sort((a, b) => b.date.localeCompare(a.date));
      saveVisits(updated);
      return updated;
    });
    toast.success(editingId ? 'Visit log updated' : 'Visit log saved');
    setSaving(false);
  };

  const handleDelete = (id: string) => {
    if (!confirm('Delete this visit log?')) return;
    setVisits(prev => { const updated = prev.filter(v => v.id !== id); saveVisits(updated); return updated; });
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
    } else { toast.info('No entry found for yesterday'); }
  };

  // Stats
  const stationVisits = visits.filter(v => v.stationId === stationId);
  const todayTotal = stationVisits.filter(v => v.date === format(new Date(), 'yyyy-MM-dd')).reduce((s, v) => s + v.totalVisits, 0);
  const thisWeek = stationVisits.filter(v => parseISO(v.date) >= subDays(new Date(), 7));
  const totalThisWeek = thisWeek.reduce((s, v) => s + v.totalVisits, 0);
  const avgDaily = thisWeek.length > 0 ? Math.round(totalThisWeek / thisWeek.length) : 0;
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  const yesterdayTotal = stationVisits.filter(v => v.date === yesterday).reduce((s, v) => s + v.totalVisits, 0);
  const dayChange = yesterdayTotal > 0 ? Math.round(((todayTotal - yesterdayTotal) / yesterdayTotal) * 100) : 0;

  // Gender totals
  const totalMale = thisWeek.reduce((s, v) => s + v.maleVisits, 0);
  const totalFemale = thisWeek.reduce((s, v) => s + v.femaleVisits, 0);
  const totalChild = thisWeek.reduce((s, v) => s + v.childVisits, 0);
  const totalGendered = totalMale + totalFemale;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Today" value={todayTotal} icon={Users} iconColor="text-primary" bgColor="bg-primary/10"
          trend={dayChange !== 0 ? { value: dayChange, up: dayChange > 0 } : undefined} />
        <KpiCard label="This Week" value={totalThisWeek} icon={TrendingUp} iconColor="text-emerald-600" bgColor="bg-emerald-50" />
        <KpiCard label="Daily Avg" value={avgDaily} icon={Clock} iconColor="text-amber-600" bgColor="bg-amber-50" />
        <KpiCard label="Days Logged" value={thisWeek.length} icon={BarChart3} iconColor="text-sky-600" bgColor="bg-sky-50" />
      </div>

      {/* Gender Breakdown Bar */}
      {totalGendered > 0 && (
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">This Week Breakdown</p>
          <div className="flex items-center gap-4">
            <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden flex">
              {totalMale > 0 && (
                <div className="h-full bg-blue-500 transition-all" style={{ width: `${(totalMale / totalGendered) * 100}%` }} />
              )}
              {totalFemale > 0 && (
                <div className="h-full bg-pink-400 transition-all" style={{ width: `${(totalFemale / totalGendered) * 100}%` }} />
              )}
            </div>
          </div>
          <div className="flex gap-4 mt-2 text-xs">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" />{totalMale} Male</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-pink-400" />{totalFemale} Female</span>
            {totalChild > 0 && <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" />{totalChild} Under 5</span>}
          </div>
        </div>
      )}

      {/* Entry Form */}
      <div className="bg-card rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Calendar className="w-4 h-4 text-primary" />
            {editingId ? 'Edit Visit Log' : 'Log Patient Visits'}
          </h3>
          {isToday(parseISO(selectedDate)) && (
            <button onClick={quickFillYesterday} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted transition-colors">
              <RotateCcw className="w-3 h-3" /> Copy yesterday
            </button>
          )}
        </div>

        {/* Date */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wide">Date</label>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
            className="px-3 py-2 rounded-lg border border-border text-sm bg-background" />
        </div>

        {/* Total */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wide">
            Total Patients Seen <span className="text-destructive">*</span>
          </label>
          <input type="number" min="0" value={displayTotal} onChange={e => setTotalVisits(e.target.value)}
            className="w-full sm:w-56 px-4 py-3 rounded-lg border border-border text-2xl font-bold bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
            placeholder="0" />
          <p className="text-xs text-muted-foreground mt-1">Auto-calculated from Male + Female, or enter total directly</p>
        </div>

        {/* Gender Breakdown */}
        <div className="grid grid-cols-3 gap-3">
          <NumberField label="Male" value={maleVisits} onChange={setMaleVisits} color="bg-blue-500" icon={CircleUser} />
          <NumberField label="Female" value={femaleVisits} onChange={setFemaleVisits} color="bg-pink-400" icon={CircleUser} />
          <NumberField label="Under 5" value={childVisits} onChange={setChildVisits} color="bg-amber-400" icon={Baby} />
        </div>

        {/* Notes */}
        <div>
          <label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wide">Notes</label>
          <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background resize-none"
            placeholder="Any notes about today's patient volume..." />
        </div>

        {/* Save */}
        <button onClick={handleSave} disabled={saving || !displayTotal || parseInt(displayTotal) <= 0}
          className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
          {saving ? <><RotateCcw className="w-4 h-4 animate-spin" /> Saving...</>
            : editingId ? <><Pencil className="w-4 h-4" /> Update Visit Log</>
            : <><Save className="w-4 h-4" /> Save Visit Log</>}
        </button>
      </div>

      {/* History */}
      {stationVisits.length > 0 && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold">Visit History — {stationName}</h3>
            <span className="text-xs text-muted-foreground">{stationVisits.length} entries</span>
          </div>
          <div className="divide-y divide-border">
            {stationVisits.slice(0, 14).map(visit => (
              <div key={visit.id} className="px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors group">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${isToday(parseISO(visit.date)) ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
                  <div>
                    <p className="text-sm font-medium">
                      {format(parseISO(visit.date), 'EEE, MMM d, yyyy')}
                      {isToday(parseISO(visit.date)) && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full ml-2 font-medium">Today</span>}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span className="font-semibold text-foreground">{visit.totalVisits}</span> visits
                      {visit.maleVisits > 0 && <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" />{visit.maleVisits}M</span>}
                      {visit.femaleVisits > 0 && <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-pink-400" />{visit.femaleVisits}F</span>}
                      {visit.childVisits > 0 && <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />{visit.childVisits}&lt;5</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => setSelectedDate(visit.date)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => handleDelete(visit.id)} className="p-1.5 rounded-md hover:bg-red-50 text-muted-foreground hover:text-red-500" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
          {stationVisits.length > 14 && (
            <p className="text-center text-xs text-muted-foreground py-2 border-t border-border">Showing last 14 days</p>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ─── */

function KpiCard({ label, value, icon: Icon, iconColor, bgColor, trend }: {
  label: string; value: number; icon: typeof Users; iconColor: string; bgColor: string;
  trend?: { value: number; up: boolean };
}) {
  return (
    <div className="bg-card rounded-xl p-4 border border-border">
      <div className="flex items-center justify-between mb-2">
        <div className={`w-8 h-8 rounded-lg ${bgColor} flex items-center justify-center`}>
          <Icon className={`w-4 h-4 ${iconColor}`} />
        </div>
        {trend && (
          <span className={`flex items-center gap-0.5 text-xs font-medium ${trend.up ? 'text-emerald-600' : 'text-red-500'}`}>
            {trend.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(trend.value)}%
          </span>
        )}
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function NumberField({ label, value, onChange, color, icon: Icon }: {
  label: string; value: string; onChange: (v: string) => void; color: string; icon: typeof Baby;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wide">
        <span className={`w-2 h-2 rounded-full ${color}`} />
        {label}
      </label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/50" />
        <input type="number" min="0" value={value} onChange={e => onChange(e.target.value)}
          className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-border text-sm font-semibold bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all"
          placeholder="0" />
      </div>
    </div>
  );
}
