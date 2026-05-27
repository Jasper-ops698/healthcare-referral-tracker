/**
 * DailyVisitLog v3 — Wired to backend API
 */

import { useState, useEffect } from 'react';
import {
  Users, Calendar, Save, TrendingUp, Clock, Trash2,
  Pencil, RotateCcw, BarChart3, ArrowUpRight, ArrowDownRight,
  Loader2,
} from 'lucide-react';
import { format, subDays, isToday, parseISO } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { upsertDailyVisit, getDailyVisits, deleteDailyVisit } from '@/lib/apiClient';

interface DailyVisit {
  _id: string;
  date: string;
  totalVisits: number;
  maleVisits: number;
  femaleVisits: number;
  childVisits: number;
  stationId: string;
  stationName: string;
  notes?: string;
  createdAt: string;
}

export default function DailyVisitLog() {
  const { user } = useAuth();
  const [visits, setVisits] = useState<DailyVisit[]>([]);
  const [, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [totalVisits, setTotalVisits] = useState('');
  const [maleVisits, setMaleVisits] = useState('');
  const [femaleVisits, setFemaleVisits] = useState('');
  const [childVisits, setChildVisits] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const stationId = user?.stationId || '';
  const stationName = user?.stationName || 'Unknown Station';


  useEffect(() => { loadVisits(); }, [stationId]);

  const loadVisits = async () => {
    if (!stationId) return;
    setLoading(true);
    setError('');
    try {
      const result = await getDailyVisits(stationId);
      if (result.success) setVisits((result.data as any)?.visits || []);
    } catch { setError('Failed to load visits'); }
    finally { setLoading(false); }
  };

  const todayEntry = visits.find(v => v.date === selectedDate);

  useEffect(() => {
    if (todayEntry) {
      setTotalVisits(String(todayEntry.totalVisits));
      setMaleVisits(String(todayEntry.maleVisits));
      setFemaleVisits(String(todayEntry.femaleVisits));
      setChildVisits(String(todayEntry.childVisits));
      setNotes(todayEntry.notes || '');
    } else {
      setTotalVisits(''); setMaleVisits(''); setFemaleVisits(''); setChildVisits(''); setNotes('');
    }
  }, [selectedDate, todayEntry]);

  const computedTotal = (parseInt(maleVisits) || 0) + (parseInt(femaleVisits) || 0);
  const displayTotal = totalVisits || (computedTotal > 0 ? String(computedTotal) : '');

  const handleSave = async () => {
    const total = parseInt(totalVisits) || computedTotal || 0;
    if (total <= 0) return;
    setSaving(true);
    try {
      await upsertDailyVisit({
        date: selectedDate, totalVisits: total,
        maleVisits: parseInt(maleVisits) || 0, femaleVisits: parseInt(femaleVisits) || 0,
        childVisits: parseInt(childVisits) || 0, notes: notes || undefined,
        stationId, stationName,
      });
      await loadVisits();
    } catch { setError('Failed to save'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete?')) return;
    await deleteDailyVisit(id);
    await loadVisits();
  };

  // Stats
  const stationVisits = visits;
  const todayTotal = stationVisits.filter(v => v.date === format(new Date(), 'yyyy-MM-dd')).reduce((s, v) => s + v.totalVisits, 0);
  const thisWeek = stationVisits.filter(v => parseISO(v.date) >= subDays(new Date(), 7));
  const totalThisWeek = thisWeek.reduce((s, v) => s + v.totalVisits, 0);
  const avgDaily = thisWeek.length > 0 ? Math.round(totalThisWeek / thisWeek.length) : 0;
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd');
  const yesterdayTotal = stationVisits.filter(v => v.date === yesterday).reduce((s, v) => s + v.totalVisits, 0);
  const dayChange = yesterdayTotal > 0 ? Math.round(((todayTotal - yesterdayTotal) / yesterdayTotal) * 100) : 0;
  const totalMale = thisWeek.reduce((s, v) => s + v.maleVisits, 0);
  const totalFemale = thisWeek.reduce((s, v) => s + v.femaleVisits, 0);
  const totalGendered = totalMale + totalFemale;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi label="Today" value={todayTotal} icon={Users} color="text-primary" bg="bg-primary/10" trend={dayChange !== 0 ? { value: dayChange, up: dayChange > 0 } : undefined} />
        <Kpi label="This Week" value={totalThisWeek} icon={TrendingUp} color="text-emerald-600" bg="bg-emerald-50" />
        <Kpi label="Daily Avg" value={avgDaily} icon={Clock} color="text-amber-600" bg="bg-amber-50" />
        <Kpi label="Days Logged" value={thisWeek.length} icon={BarChart3} color="text-sky-600" bg="bg-sky-50" />
      </div>

      {totalGendered > 0 && (
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">This Week Breakdown</p>
          <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden flex">
            {totalMale > 0 && <div className="h-full bg-blue-500 transition-all" style={{ width: `${(totalMale / totalGendered) * 100}%` }} />}
            {totalFemale > 0 && <div className="h-full bg-pink-400 transition-all" style={{ width: `${(totalFemale / totalGendered) * 100}%` }} />}
          </div>
          <div className="flex gap-4 mt-2 text-xs">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" />{totalMale} Male</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-pink-400" />{totalFemale} Female</span>
          </div>
        </div>
      )}

      <div className="bg-card rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold flex items-center gap-2"><Calendar className="w-4 h-4 text-primary" />{todayEntry ? 'Edit' : 'Log'} Patient Visits</h3>
          {isToday(parseISO(selectedDate)) && (
            <button onClick={() => { const y = visits.find(v => v.date === yesterday); if (y) { setTotalVisits(String(y.totalVisits)); setMaleVisits(String(y.maleVisits)); setFemaleVisits(String(y.femaleVisits)); setChildVisits(String(y.childVisits)); }}}
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 px-2 py-1 rounded-md hover:bg-muted transition-colors">
              <RotateCcw className="w-3 h-3" /> Copy yesterday
            </button>
          )}
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div><label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wide">Date</label>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="px-3 py-2 rounded-lg border border-border text-sm bg-background" /></div>

        <div><label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wide">Total Patients Seen *</label>
          <input type="number" min="0" value={displayTotal} onChange={e => setTotalVisits(e.target.value)}
            className="w-full sm:w-56 px-4 py-3 rounded-lg border border-border text-2xl font-bold bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" placeholder="0" /></div>

        <div className="grid grid-cols-3 gap-3">
          <NumField label="Male" value={maleVisits} onChange={setMaleVisits} color="bg-blue-500" />
          <NumField label="Female" value={femaleVisits} onChange={setFemaleVisits} color="bg-pink-400" />
          <NumField label="Under 5" value={childVisits} onChange={setChildVisits} color="bg-amber-400" />
        </div>

        <div><label className="text-xs font-semibold text-muted-foreground mb-1.5 block uppercase tracking-wide">Notes</label>
          <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border text-sm bg-background resize-none" placeholder="Any notes..." /></div>

        <button onClick={handleSave} disabled={saving || !displayTotal || parseInt(displayTotal) <= 0}
          className="w-full px-6 py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
          {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
            : todayEntry ? <><Pencil className="w-4 h-4" /> Update Visit Log</>
            : <><Save className="w-4 h-4" /> Save Visit Log</>}
        </button>
      </div>

      {stationVisits.length > 0 && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="text-sm font-semibold">Visit History — {stationName}</h3>
            <span className="text-xs text-muted-foreground">{stationVisits.length} entries</span>
          </div>
          <div className="divide-y divide-border">
            {stationVisits.slice(0, 14).map(visit => (
              <div key={visit._id} className="px-4 py-3 flex items-center justify-between hover:bg-muted/30 transition-colors group">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${isToday(parseISO(visit.date)) ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
                  <div>
                    <p className="text-sm font-medium">{format(parseISO(visit.date), 'EEE, MMM d, yyyy')}{isToday(parseISO(visit.date)) && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-full ml-2 font-medium">Today</span>}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span className="font-semibold text-foreground">{visit.totalVisits}</span> visits
                      {visit.maleVisits > 0 && <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-blue-500" />{visit.maleVisits}M</span>}
                      {visit.femaleVisits > 0 && <span className="flex items-center gap-0.5"><span className="w-1.5 h-1.5 rounded-full bg-pink-400" />{visit.femaleVisits}F</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => setSelectedDate(visit.date)} className="p-1.5 rounded-md hover:bg-muted text-muted-foreground" title="Edit"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => handleDelete(visit._id)} className="p-1.5 rounded-md hover:bg-red-50 text-muted-foreground hover:text-red-500" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, icon: Icon, color, bg, trend }: { label: string; value: number; icon: typeof Users; color: string; bg: string; trend?: { value: number; up: boolean } }) {
  return (
    <div className="bg-card rounded-xl p-4 border border-border">
      <div className="flex items-center justify-between mb-2">
        <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}><Icon className={`w-4 h-4 ${color}`} /></div>
        {trend && <span className={`flex items-center gap-0.5 text-xs font-medium ${trend.up ? 'text-emerald-600' : 'text-red-500'}`}>{trend.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}{Math.abs(trend.value)}%</span>}
      </div>
      <p className="text-2xl font-bold">{value}</p><p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function NumField({ label, value, onChange, color }: { label: string; value: string; onChange: (v: string) => void; color: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 uppercase tracking-wide"><span className={`w-2 h-2 rounded-full ${color}`} />{label}</label>
      <input type="number" min="0" value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-border text-sm font-semibold bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all" placeholder="0" />
    </div>
  );
}
