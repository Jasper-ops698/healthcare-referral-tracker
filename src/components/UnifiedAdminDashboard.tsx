/**
 * Unified Admin Dashboard v2.1 — Analytics-focused monitoring view
 *
 * 4 sections:
 *   1. Line Graph: Monthly/Yearly referral activities per facility (toggle)
 *   2. Pie Chart: Gender/Age distribution of referral cases
 *   3. Bar Graph: Disease prevalence & referral reasons per facility
 *   4. AI Chat + Export: Gemini-powered discussion and report generation
 */

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Area, AreaChart,
} from 'recharts';
import { jsPDF } from 'jspdf';
import {
  Activity, TrendingUp, Send, Download, Sparkles,
  FileText, Loader2, User, Stethoscope,
  ClipboardList, HeartPulse, Baby, AlertTriangle,
  Filter, X, CalendarDays, MapPin, ShieldAlert,
  RefreshCw, UserCheck,
} from 'lucide-react';
import {
  getAllReferralsV2, sendAIChat, generateAIExportReport, analyzeDiseaseIncidence, getChpFollowUpStats,
} from '@/lib/apiClient';
import type { ChatMessage } from '@/lib/apiClient';
import type { ReferralV2 } from '@/types';
import { toast } from 'sonner';
import { LOGO_BASE64 } from '@/lib/logoBase64';
import { useI18n } from '@/i18n/useI18n';

const COLORS = ['#0ea5e9', '#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6', '#f43f5e', '#06b6d4', '#84cc16'];
const GENDER_COLORS = { male: '#0ea5e9', female: '#ec4899', other: '#94a3b8' };
const AGE_COLORS = ['#14b8a6', '#0ea5e9', '#f59e0b', '#ec4899', '#f43f5e'];

export default function UnifiedAdminDashboard() {
  const { t } = useI18n();
  const [referrals, setReferrals] = useState<ReferralV2[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'monthly' | 'yearly'>('monthly');

  // Chat state
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: 'model', text: 'Hello! I am HealthTrack AI. Ask me about referral trends, disease patterns, or station performance. I can analyze all your data and provide public health insights.' },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Export state
  const [exportPrompt, setExportPrompt] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [showExport, setShowExport] = useState(false);

  // Disease incidence state
  const [incidenceData, setIncidenceData] = useState<any[]>([]);
  const [incidencePeriod, setIncidencePeriod] = useState<'monthly' | 'yearly'>('yearly');
  const [incidenceLoading, setIncidenceLoading] = useState(false);
  const [incidenceSummary, setIncidenceSummary] = useState('');
  const [showIncidence, setShowIncidence] = useState(false);

  // CHP follow-up state
  const [chpStats, setChpStats] = useState<any>(null);
  const [chpStatsPeriod, setChpStatsPeriod] = useState<'monthly' | 'yearly'>('yearly');
  const [chpStatsLoading, setChpStatsLoading] = useState(false);
  const loadChpStats = async () => {
    setChpStatsLoading(true);
    try {
      const res = await getChpFollowUpStats(chpStatsPeriod);
      if (res.success && res.data) {
        setChpStats(res.data);
      }
    } catch (e) { console.error('CHP stats load failed:', e); }
    finally { setChpStatsLoading(false); }
  };

  // Filter state
  const [filterStationType, setFilterStationType] = useState<'all' | 'household' | 'hip' | 'referral-center'>('all');
  const [filterUrgency, setFilterUrgency] = useState<'all' | 'emergency' | 'urgent' | 'routine'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'in-transit' | 'accepted' | 'in-treatment' | 'counter-referral-created' | 'completed'>('all');
  const [filterDateRange, setFilterDateRange] = useState<'all' | '7days' | '30days' | '90days'>('all');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await getAllReferralsV2();
      if (res.success) setReferrals(((res.data as any)?.referrals || []) as ReferralV2[]);
    } catch (e) { console.error('Load failed:', e); }
    finally { setLoading(false); }
  };

  // ─── FILTERED DATASET (all charts + KPIs use this) ───
  const filteredReferrals = useMemo(() => {
    const now = new Date();
    return referrals.filter(r => {
      // Station type filter
      if (filterStationType !== 'all') {
        const st = r.sourceStationType || r.destinationStationType;
        if (st !== filterStationType) return false;
      }
      // Urgency filter
      if (filterUrgency !== 'all' && r.urgency !== filterUrgency) return false;
      // Status filter
      if (filterStatus !== 'all' && r.status !== filterStatus) return false;
      // Date range filter
      if (filterDateRange !== 'all') {
        const rDate = new Date(r.createdAt);
        const days = filterDateRange === '7days' ? 7 : filterDateRange === '30days' ? 30 : 90;
        const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        if (rDate < cutoff) return false;
      }
      return true;
    });
  }, [referrals, filterStationType, filterUrgency, filterStatus, filterDateRange]);

  // ─── 1. LINE CHART: Referral activities per facility over time ───
  const { lineChartData, facilityNames } = useMemo(() => {
    const data = filteredReferrals;
    if (data.length === 0) return { lineChartData: [], facilityNames: [] };

    // Determine date range
    const dates = referrals.map(r => new Date(r.createdAt));
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));

    // Generate all periods in range (fills gaps with 0)
    const allPeriods: string[] = [];
    if (period === 'monthly') {
      const d = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
      while (d <= maxDate) {
        allPeriods.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
        d.setMonth(d.getMonth() + 1);
      }
    } else {
      for (let y = minDate.getFullYear(); y <= maxDate.getFullYear(); y++) {
        allPeriods.push(`${y}`);
      }
    }

    // Group referrals by period and facility
    const periodFacilityMap = new Map<string, Map<string, number>>();
    referrals.forEach(r => {
      const d = new Date(r.createdAt);
      const key = period === 'monthly'
        ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        : `${d.getFullYear()}`;
      const facility = r.destinationStationName || r.sourceStationName || 'Unknown';
      if (!periodFacilityMap.has(key)) periodFacilityMap.set(key, new Map());
      periodFacilityMap.get(key)!.set(facility, (periodFacilityMap.get(key)!.get(facility) || 0) + 1);
    });

    // Top 6 facilities by total volume
    const facilityTotals = new Map<string, number>();
    referrals.forEach(r => {
      const f = r.destinationStationName || r.sourceStationName || 'Unknown';
      facilityTotals.set(f, (facilityTotals.get(f) || 0) + 1);
    });
    const topFacilities = Array.from(facilityTotals.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name]) => name);

    // Build rows with ALL periods (gaps filled with 0)
    const rows = allPeriods.map(p => {
      const row: Record<string, string | number> = { period: p };
      let total = 0;
      topFacilities.forEach(f => {
        const count = periodFacilityMap.get(p)?.get(f) || 0;
        row[f] = count;
        total += count;
      });
      row['All Facilities'] = total;
      return row;
    });

    return { lineChartData: rows, facilityNames: topFacilities };
  }, [referrals, period]);

  // Format period labels for display
  const formatPeriodLabel = (p: string) => {
    if (period === 'monthly') {
      const [year, month] = p.split('-');
      return new Date(`${year}-${month}-01`).toLocaleDateString('en', { month: 'short', year: 'numeric' });
    }
    return p;
  };

  // ─── 2. PIE CHARTS: Gender & Age distribution ───
  const genderData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredReferrals.forEach(r => {
      const g = r.patientGender || 'unknown';
      counts[g] = (counts[g] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({
      name: name.charAt(0).toUpperCase() + name.slice(1),
      value,
      color: GENDER_COLORS[name as keyof typeof GENDER_COLORS] || '#94a3b8',
    }));
  }, [referrals]);

  const ageData = useMemo(() => {
    const groups: Record<string, number> = { '0-5': 0, '6-18': 0, '19-35': 0, '36-50': 0, '50+': 0 };
    filteredReferrals.forEach(r => {
      const age = r.patientAge;
      if (age <= 5) groups['0-5']++;
      else if (age <= 18) groups['6-18']++;
      else if (age <= 35) groups['19-35']++;
      else if (age <= 50) groups['36-50']++;
      else groups['50+']++;
    });
    return Object.entries(groups)
      .filter(([, v]) => v > 0)
      .map(([name, value], i) => ({ name, value, color: AGE_COLORS[i] || '#94a3b8' }));
  }, [referrals]);

  // ─── 3. BAR CHART: Disease prevalence & referral reasons ───
  const diseaseData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredReferrals.forEach(r => {
      const d = r.initialDiagnosis?.toLowerCase().trim() || 'Unspecified';
      // Truncate long diagnosis names
      const key = d.length > 30 ? d.slice(0, 30) + '...' : d;
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value]) => ({ name, value }));
  }, [referrals]);

  const referralReasonData = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredReferrals.forEach(r => {
      const reason = r.reasonForReferral?.toLowerCase().trim() || 'Unspecified';
      const key = reason.length > 30 ? reason.slice(0, 30) + '...' : reason;
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, value]) => ({ name, value }));
  }, [referrals]);

  // ─── AI Chat ───
  const handleChatSend = useCallback(async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg: ChatMessage = { role: 'user', text: chatInput.trim() };
    const newMessages = [...chatMessages, userMsg];
    setChatMessages(newMessages);
    setChatInput('');
    setChatLoading(true);

    try {
      const res = await sendAIChat(newMessages, { period });
      if (res.success && res.data) {
        const reply = (res.data as any).response || 'I could not process that request.';
        setChatMessages(prev => [...prev, { role: 'model', text: reply }]);
      } else {
        setChatMessages(prev => [...prev, { role: 'model', text: 'Sorry, I encountered an error. Please try again.' }]);
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'model', text: 'Connection failed. Please check your network and try again.' }]);
    } finally {
      setChatLoading(false);
    }
  }, [chatInput, chatMessages, chatLoading, period]);

  useEffect(() => {
    // Scroll only within the chat container, never the page
    const el = chatEndRef.current;
    if (el && el.parentElement) {
      el.parentElement.scrollTop = el.parentElement.scrollHeight;
    }
  }, [chatMessages, chatLoading]);

  // ─── Export Report as PDF ───
  const handleExport = async () => {
    if (!exportPrompt.trim()) return;
    setExportLoading(true);
    try {
      const res = await generateAIExportReport(exportPrompt, 'html');
      if (res.success && res.data) {
        const content = (res.data as any).content || '';

        // Logo colours from brand: maroon #9B1B3A, sky blue #5AB4E6, golden #D4A017
        const C_MAROON: [number, number, number] = [155, 27, 58];
        const C_SKY: [number, number, number] = [90, 180, 230];
        const C_GOLD: [number, number, number] = [212, 160, 23];
        const C_GRAY: [number, number, number] = [100, 100, 100];
        const C_DARK: [number, number, number] = [40, 40, 40];

        const doc = new jsPDF({ unit: 'mm', format: 'a4' });
        const pageWidth = doc.internal.pageSize.getWidth();
        const margin = 15;
        const textWidth = pageWidth - margin * 2;

        // ─── Header with Logo ───
        // Logo (left-aligned, ~15mm wide)
        doc.addImage(LOGO_BASE64, 'PNG', margin, 8, 15, 15);

        // Title next to logo
        doc.setFont('times', 'bold');
        doc.setFontSize(20);
        doc.setTextColor(...C_MAROON);
        doc.text('Patient Referral Track Report', margin + 18, 17);

        // Subtitle under title
        doc.setFont('times', 'italic');
        doc.setFontSize(9);
        doc.setTextColor(...C_GRAY);
        doc.text(`Generated: ${new Date().toLocaleDateString('en', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`, margin + 18, 22);

        // Golden accent line under header
        doc.setDrawColor(...C_GOLD);
        doc.setLineWidth(0.8);
        doc.line(margin, 26, pageWidth - margin, 26);

        // Thin maroon line below gold
        doc.setDrawColor(...C_MAROON);
        doc.setLineWidth(0.3);
        doc.line(margin, 27.5, pageWidth - margin, 27.5);

        // ─── Query Box ───
        doc.setFillColor(250, 248, 245);
        doc.roundedRect(margin, 30, textWidth, 10, 2, 2, 'F');
        doc.setFont('times', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...C_SKY);
        doc.text('Query:', margin + 3, 35.5);
        doc.setFont('times', 'normal');
        doc.setTextColor(...C_DARK);
        const queryLines = doc.splitTextToSize(`"${exportPrompt}"`, textWidth - 20);
        doc.text(queryLines, margin + 14, 35.5);

        // ─── Content ───
        const contentY = queryLines.length > 1 ? 44 : 42;

        // Strip HTML for clean text
        const plainText = content
          .replace(/<style[^>]*>.*?<\/style>/gs, '')
          .replace(/<script[^>]*>.*?<\/script>/gs, '')
          .replace(/<br\s*\/?>/gi, '\n')
          .replace(/<\/p>/gi, '\n\n')
          .replace(/<li>/gi, '\n  \u2022 ')
          .replace(/<\/li>/gi, '')
          .replace(/<h[1-6][^>]*>/gi, '\n\n')
          .replace(/<\/h[1-6]>/gi, '\n')
          .replace(/<[^>]+>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/\n{4,}/g, '\n\n\n')
          .trim();

        doc.setFont('times', 'normal');
        doc.setFontSize(10);
        doc.setTextColor(...C_DARK);

        const lines = doc.splitTextToSize(plainText, textWidth);
        let y = contentY;

        for (const line of lines) {
          if (y > 280) {
            doc.addPage();
            y = 20;
          }
          doc.text(line, margin, y);
          y += 4.8;
        }

        // ─── Footer on every page ───
        const totalPages = doc.getNumberOfPages();
        for (let i = 1; i <= totalPages; i++) {
          doc.setPage(i);
          // Maroon footer line
          doc.setDrawColor(...C_MAROON);
          doc.setLineWidth(0.3);
          doc.line(margin, 287, pageWidth - margin, 287);
          // Page number
          doc.setFont('times', 'italic');
          doc.setFontSize(8);
          doc.setTextColor(...C_GRAY);
          doc.text(`Page ${i} of ${totalPages}`, pageWidth / 2, 292, { align: 'center' });
          // System name
          doc.setTextColor(...C_MAROON);
          doc.setFont('times', 'bold');
          doc.text('HealthTrack — Patient Referral Tracking System', pageWidth / 2, 296, { align: 'center' });
        }

        doc.save(`Patient-Referral-Track-Report-${new Date().toISOString().slice(0, 10)}.pdf`);
        toast.success('PDF report downloaded');
        setShowExport(false);
        setExportPrompt('');
      } else {
        toast.error('Failed to generate report');
      }
    } catch {
      toast.error('Network error generating report');
    } finally {
      setExportLoading(false);
    }
  };

  // ─── Disease Incidence Analysis ───
  const handleAnalyzeIncidence = async () => {
    setIncidenceLoading(true);
    try {
      const res = await analyzeDiseaseIncidence(incidencePeriod);
      if (res.success && res.data) {
        setIncidenceData((res.data as any).results || []);
        setIncidenceSummary((res.data as any).summary || '');
        setShowIncidence(true);
        toast.success('Disease incidence analysis complete');
      } else {
        toast.error('Failed to analyze disease incidence');
      }
    } catch {
      toast.error('Network error analyzing incidence');
    } finally {
      setIncidenceLoading(false);
    }
  };

  // ─── KPI Summary ───
  const kpi = useMemo(() => ({
    total: filteredReferrals.length,
    emergency: filteredReferrals.filter(r => r.urgency === 'emergency').length,
    urgent: filteredReferrals.filter(r => r.urgency === 'urgent').length,
    completed: filteredReferrals.filter(r => r.status === 'counter-referral-created' || r.status === 'completed').length,
  }), [filteredReferrals]);

  // Active filter count for badge
  const activeFilterCount = [filterStationType, filterUrgency, filterStatus, filterDateRange]
    .filter(f => f !== 'all').length;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full relative">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            {t('analytics.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('analytics.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowExport(!showExport)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors text-sm font-medium"
          >
            <FileText className="w-4 h-4" /> {t('analytics.exportReport')}
          </button>
          <button
            onClick={() => setChatOpen(!chatOpen)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            <Sparkles className="w-4 h-4" /> {t('analytics.aiAdvisor')}
          </button>
        </div>
      </div>

      {/* Export Panel */}
      {showExport && (
        <div className="bg-card rounded-xl border border-border p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Download className="w-4 h-4" /> {t('analytics.generateCustomReport')}
          </h3>
          <p className="text-xs text-muted-foreground">{t('analytics.reportPrompt')}</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={exportPrompt}
              onChange={e => setExportPrompt(e.target.value)}
              placeholder="e.g., Summary of malaria referral trends by station for the last 3 months"
              className="flex-1 px-3 py-2 rounded-lg border border-border text-sm bg-background"
              onKeyDown={e => e.key === 'Enter' && handleExport()}
            />
            <button
              onClick={handleExport}
              disabled={exportLoading || !exportPrompt.trim()}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {exportLoading ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : <><Download className="w-4 h-4" /> Export</>}
            </button>
          </div>
        </div>
      )}

      {/* AI Chat Panel — Modal Overlay */}
      {chatOpen && (
        <div className="absolute top-0 left-0 right-0 z-40 bg-card/95 backdrop-blur-sm rounded-xl border border-primary/30 shadow-2xl flex flex-col mx-0" style={{ height: '420px' }}>
          <div className="px-4 py-3 border-b border-primary/20 bg-primary/5 flex items-center justify-between shrink-0">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" /> {t('analytics.aiChatTitle')}
            </h3>
            <button onClick={() => setChatOpen(false)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors">{t('common.close')}</button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
            {chatMessages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'model' && (
                  <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Sparkles className="w-3.5 h-3.5 text-primary" />
                  </div>
                )}
                <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm ${
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground rounded-br-sm'
                    : 'bg-muted rounded-bl-sm'
                }`}>
                  <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                </div>
              </div>
            ))}
            {chatLoading && (
              <div className="flex gap-2">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Sparkles className="w-3.5 h-3.5 text-primary animate-pulse" />
                </div>
                <div className="bg-muted rounded-xl rounded-bl-sm px-3 py-2">
                  <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="p-3 border-t border-border flex gap-2 shrink-0">
            <input
              type="text"
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              placeholder={t('analytics.chatPlaceholder')}
              className="flex-1 px-3 py-2 rounded-lg border border-border text-sm bg-background"
              onKeyDown={e => e.key === 'Enter' && handleChatSend()}
            />
            <button
              onClick={handleChatSend}
              disabled={chatLoading || !chatInput.trim()}
              className="px-3 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-card rounded-xl border border-border p-3 space-y-3">
        <div className="flex items-center justify-between">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              showFilters || activeFilterCount > 0
                ? 'bg-primary text-primary-foreground'
                : 'hover:bg-muted text-muted-foreground'
            }`}
          >
            <Filter className="w-4 h-4" />
            {t('analytics.filters')}
            {activeFilterCount > 0 && (
              <span className="bg-primary-foreground text-primary text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center">
                {activeFilterCount}
              </span>
            )}
          </button>
          {activeFilterCount > 0 && (
            <button
              onClick={() => {
                setFilterStationType('all');
                setFilterUrgency('all');
                setFilterStatus('all');
                setFilterDateRange('all');
              }}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-red-600 transition-colors px-2 py-1 rounded hover:bg-red-50"
            >
              <X className="w-3 h-3" /> {t('analytics.clearAll')}
            </button>
          )}
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2 border-t border-border">
            {/* Station Type */}
            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <MapPin className="w-3 h-3" /> {t('analytics.stationType')}
              </label>
              <select
                value={filterStationType}
                onChange={e => setFilterStationType(e.target.value as any)}
                className="w-full px-2.5 py-2 rounded-lg border border-border text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="all">{t('analytics.allTypes')}</option>
                <option value="household">{t('analytics.household')}</option>
                <option value="hip">{t('analytics.hip')}</option>
                <option value="referral-center">{t('analytics.referralCenter')}</option>
              </select>
            </div>

            {/* Urgency */}
            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <ShieldAlert className="w-3 h-3" /> {t('analytics.urgency')}
              </label>
              <select
                value={filterUrgency}
                onChange={e => setFilterUrgency(e.target.value as any)}
                className="w-full px-2.5 py-2 rounded-lg border border-border text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="all">{t('analytics.allLevels')}</option>
                <option value="emergency">{t('analytics.emergency')}</option>
                <option value="urgent">{t('analytics.urgent')}</option>
                <option value="routine">{t('analytics.routine')}</option>
              </select>
            </div>

            {/* Status */}
            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <Activity className="w-3 h-3" /> {t('analytics.status')}
              </label>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value as any)}
                className="w-full px-2.5 py-2 rounded-lg border border-border text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="all">{t('analytics.allStatuses')}</option>
                <option value="pending">{t('analytics.pending')}</option>
                <option value="in-transit">{t('analytics.inTransit')}</option>
                <option value="accepted">{t('analytics.accepted')}</option>
                <option value="in-treatment">{t('analytics.inTreatment')}</option>
                <option value="counter-referral-created">{t('analytics.counterReferral')}</option>
                <option value="completed">{t('analytics.completed')}</option>
              </select>
            </div>

            {/* Date Range */}
            <div className="space-y-1">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                <CalendarDays className="w-3 h-3" /> {t('analytics.dateRange')}
              </label>
              <select
                value={filterDateRange}
                onChange={e => setFilterDateRange(e.target.value as any)}
                className="w-full px-2.5 py-2 rounded-lg border border-border text-sm bg-background focus:ring-2 focus:ring-primary/20 focus:border-primary"
              >
                <option value="all">{t('analytics.allTime')}</option>
                <option value="7days">{t('analytics.last7Days')}</option>
                <option value="30days">{t('analytics.last30Days')}</option>
                <option value="90days">{t('analytics.last90Days')}</option>
              </select>
            </div>
          </div>
        )}

        {/* Active filter chips */}
        {activeFilterCount > 0 && (
          <div className="flex flex-wrap gap-2">
            {filterStationType !== 'all' && (
              <button
                onClick={() => setFilterStationType('all')}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
              >
                <MapPin className="w-3 h-3" /> Station: {filterStationType} <X className="w-3 h-3" />
              </button>
            )}
            {filterUrgency !== 'all' && (
              <button
                onClick={() => setFilterUrgency('all')}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-red-50 text-red-600 border border-red-200 hover:bg-red-100 transition-colors"
              >
                <ShieldAlert className="w-3 h-3" /> {t('analytics.urgency')}: {filterUrgency} <X className="w-3 h-3" />
              </button>
            )}
            {filterStatus !== 'all' && (
              <button
                onClick={() => setFilterStatus('all')}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
              >
                <Activity className="w-3 h-3" /> {t('analytics.status')}: {filterStatus} <X className="w-3 h-3" />
              </button>
            )}
            {filterDateRange !== 'all' && (
              <button
                onClick={() => setFilterDateRange('all')}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-sky-50 text-sky-700 border border-sky-200 hover:bg-sky-100 transition-colors"
              >
                <CalendarDays className="w-3 h-3" /> {filterDateRange === '7days' ? 'Last 7 Days' : filterDateRange === '30days' ? 'Last 30 Days' : 'Last 90 Days'} <X className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi icon={ClipboardList} color="text-primary" bg="bg-primary/10" label={t('analytics.totalReferrals')} value={kpi.total} />
        <Kpi icon={HeartPulse} color="text-red-600" bg="bg-red-50" label={t('analytics.emergencies')} value={kpi.emergency} />
        <Kpi icon={AlertTriangle} color="text-amber-600" bg="bg-amber-50" label={t('analytics.urgentCases')} value={kpi.urgent} />
        <Kpi icon={TrendingUp} color="text-emerald-600" bg="bg-emerald-50" label={t('analytics.completedCases')} value={kpi.completed} />
      </div>

      {/* ─── 1. LINE CHART: Referral Activities Per Facility ─── */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            {t('analytics.referralActivitiesPerFacility')}
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setPeriod('monthly')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${period === 'monthly' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              >
                {t('analytics.monthly')}
              </button>
              <button
                onClick={() => setPeriod('yearly')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${period === 'yearly' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              >
                {t('analytics.yearly')}
              </button>
            </div>
          </div>
        </div>
        {lineChartData.length === 0 ? (
          <EmptyState message={t('analytics.noReferralData')} />
        ) : (
          <ResponsiveContainer width="100%" height={340}>
            <AreaChart data={lineChartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                {facilityNames.map((name, i) => (
                  <linearGradient key={name} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.15} />
                    <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0} />
                  </linearGradient>
                ))}
                <linearGradient id="grad-total" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#334155" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="#334155" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="period"
                tick={{ fontSize: 10 }}
                tickFormatter={formatPeriodLabel}
                axisLine={{ stroke: '#e2e8f0' }}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} axisLine={false} tickLine={false} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload) return null;
                  const nonZero = payload.filter(p => p.value && Number(p.value) > 0);
                  return (
                    <div className="bg-white border border-border rounded-lg shadow-lg p-3 text-xs">
                      <p className="font-semibold text-muted-foreground mb-1.5">{formatPeriodLabel(label)}</p>
                      {nonZero.map((p, i) => (
                        <div key={i} className="flex items-center gap-2 py-0.5">
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
                          <span className="flex-1">{p.name}:</span>
                          <span className="font-bold">{p.value}</span>
                        </div>
                      ))}
                      {nonZero.length === 0 && <span className="text-muted-foreground">{t('analytics.noReferrals')}</span>}
                    </div>
                  );
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
              {/* Total line (dashed, on top) */}
              <Area
                type="monotone"
                dataKey="All Facilities"
                stroke="#334155"
                fill="url(#grad-total)"
                strokeWidth={2}
                strokeDasharray="6 3"
                dot={{ r: 3, fill: '#334155' }}
                activeDot={{ r: 5 }}
              />
              {facilityNames.map((name, i) => (
                <Area
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={COLORS[i % COLORS.length]}
                  fill={`url(#grad-${i})`}
                  strokeWidth={2}
                  dot={{ r: 3, fill: COLORS[i % COLORS.length], strokeWidth: 0 }}
                  activeDot={{ r: 5, strokeWidth: 2, stroke: 'white' }}
                  animationDuration={600}
                  animationEasing="ease-in-out"
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ─── 2. PIE CHARTS: Gender + Age Distribution ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Gender */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="text-base font-semibold flex items-center gap-2 mb-4">
            <User className="w-4 h-4 text-primary" />
            {t('analytics.genderDistribution')}
          </h2>
          {genderData.length === 0 ? (
            <EmptyState message={t('analytics.noGenderData')} />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={genderData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={4} dataKey="value">
                  {genderData.map((entry, i) => (
                    <Cell key={`cell-${i}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number, name: string) => [`${value} cases`, name]} />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Age */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="text-base font-semibold flex items-center gap-2 mb-4">
            <Baby className="w-4 h-4 text-primary" />
            {t('analytics.ageDistribution')}
          </h2>
          {ageData.length === 0 ? (
            <EmptyState message={t('analytics.noAgeData')} />
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={ageData} cx="50%" cy="50%" outerRadius={100} paddingAngle={3} dataKey="value">
                  {ageData.map((entry, i) => (
                    <Cell key={`cell-${i}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number, name: string) => [`${value} cases`, name]} />
                <Legend verticalAlign="bottom" height={36} wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ─── 4. DISEASE INCIDENCE: Village Population at Risk ─── */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" />
            {t('analytics.diseaseIncidence')}
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setIncidencePeriod('monthly')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${incidencePeriod === 'monthly' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              >
                {t('analytics.monthly')}
              </button>
              <button
                onClick={() => setIncidencePeriod('yearly')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${incidencePeriod === 'yearly' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              >
                {t('analytics.yearly')}
              </button>
            </div>
            <button
              onClick={handleAnalyzeIncidence}
              disabled={incidenceLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {incidenceLoading ? <><Loader2 className="w-3 h-3 animate-spin" /> {t('analytics.analyzing')}</> : <><Sparkles className="w-3 h-3" /> {t('analytics.analyze')}</>}
            </button>
          </div>
        </div>

        {!showIncidence ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <MapPin className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">{t('analytics.incidencePrompt')}</p>
            <p className="text-xs mt-1 max-w-sm text-center">{t('analytics.incidenceDescription')}</p>
          </div>
        ) : incidenceData.length === 0 ? (
          <EmptyState message={t('analytics.noVillageData')} />
        ) : (
          <>
            {incidenceSummary && (
              <div className="mb-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                  <span className="text-xs font-semibold text-amber-800">{t('analytics.aiInsight')}</span>
                </div>
                <p className="text-xs text-amber-700 leading-relaxed">{incidenceSummary}</p>
              </div>
            )}
            <ResponsiveContainer width="100%" height={360}>
              <BarChart data={incidenceData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="village" tick={{ fontSize: 10 }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} label={{ value: '%', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#94a3b8' } }} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white border border-border rounded-lg shadow-lg p-3 text-xs max-w-xs">
                        <p className="font-semibold mb-1" style={{ color: d.color }}>{d.village}</p>
                        <p className="text-muted-foreground">{t('analytics.population')}: <span className="font-semibold text-foreground">{d.population?.toLocaleString()}</span></p>
                        <p className="text-muted-foreground">{t('analytics.referrals')}: <span className="font-semibold text-foreground">{d.referralCount}</span></p>
                        <p className="mt-1 font-semibold" style={{ color: d.color }}>{d.overallAtRiskPercentage}% {t('analytics.atRisk')}</p>
                        {Object.entries(d.diseaseBreakdown || {}).length > 0 && (
                          <div className="mt-2 pt-2 border-t border-border">
                            <p className="text-[10px] font-semibold text-muted-foreground mb-1 uppercase">{t('analytics.byDisease')}</p>
                            {Object.entries(d.diseaseBreakdown).map(([disease, info]: [string, any]) => (
                              <div key={disease} className="flex justify-between py-0.5">
                                <span className="capitalize">{disease}</span>
                                <span className="font-medium">{info.count} ({info.percentageOfPopulation}%)</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  }}
                />
                <Bar dataKey="overallAtRiskPercentage" name={t('analytics.percentageAtRisk')} radius={[4, 4, 0, 0]} maxBarSize={60}>
                  {incidenceData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3 mt-3">
              {incidenceData.map((v: any) => (
                <div key={v.village} className="flex items-center gap-1.5 text-[11px]">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: v.color }} />
                  <span className="text-muted-foreground">{v.village}</span>
                  <span className="font-semibold">{v.overallAtRiskPercentage}%</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ─── 3. CHP FOLLOW-UP TRACKING ─── */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-primary" />
            {t('analytics.chpFollowUp')}
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button onClick={() => setChpStatsPeriod('monthly')} className={`px-3 py-1.5 text-xs font-medium transition-colors ${chpStatsPeriod === 'monthly' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>{t('analytics.monthly')}</button>
              <button onClick={() => setChpStatsPeriod('yearly')} className={`px-3 py-1.5 text-xs font-medium transition-colors ${chpStatsPeriod === 'yearly' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>{t('analytics.yearly')}</button>
            </div>
            <button onClick={loadChpStats} disabled={chpStatsLoading} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50">
              {chpStatsLoading ? <><Loader2 className="w-3 h-3 animate-spin" /> {t('analytics.loading')}</> : <><RefreshCw className="w-3 h-3" /> {t('analytics.refresh')}</>}
            </button>
          </div>
        </div>

        {!chpStats ? (
          <div className="flex flex-col items-center justify-center py-10 text-muted-foreground">
            <UserCheck className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">{t('analytics.chpNoData')}</p>
            <p className="text-xs mt-1 max-w-sm text-center">{t('analytics.chpDescription')}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Response Rate */}
            <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-200">
              <p className="text-xs font-semibold text-emerald-800 uppercase tracking-wide mb-2">{t('analytics.chpResponseRate')}</p>
              <div className="flex items-end gap-2">
                <span className="text-3xl font-bold text-emerald-700">{chpStats.chpResponseRate || 0}%</span>
                <span className="text-xs text-emerald-600 mb-1">({chpStats.chpResponseReceived || 0}/{chpStats.totalCounterReferrals || 0})</span>
              </div>
              <p className="text-[11px] text-emerald-600 mt-1">{t('analytics.chpsResponded')}</p>
            </div>
            {/* Recovery Status Breakdown */}
            <div className="sm:col-span-2 bg-muted/30 rounded-xl p-4 border border-border">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t('analytics.recoveryOutcomes')}</p>
              {chpStats.recoveryStatusBreakdown && Object.keys(chpStats.recoveryStatusBreakdown).length > 0 ? (
                <div className="space-y-2">
                  {Object.entries(chpStats.recoveryStatusBreakdown as Record<string, number>).map(([status, count]) => {
                    const total = chpStats.chpResponseReceived || 1;
                    const pct = Math.round((count / total) * 100);
                    const colors: Record<string, string> = { 'fully-recovered': 'bg-emerald-500', 'partially-recovered': 'bg-sky-500', 'still-unwell': 'bg-amber-500', 'deceased': 'bg-slate-500', 'lost-to-follow-up': 'bg-red-400' };
                    const labels: Record<string, string> = { 'fully-recovered': t('analytics.fullyRecovered'), 'partially-recovered': t('analytics.partiallyRecovered'), 'still-unwell': t('analytics.stillUnwell'), 'deceased': t('analytics.deceased'), 'lost-to-follow-up': t('analytics.lostToFollowUp') };
                    return (
                      <div key={status}>
                        <div className="flex justify-between text-xs mb-1">
                          <span>{labels[status] || status}</span>
                          <span className="font-semibold">{count} ({pct}%)</span>
                        </div>
                        <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${colors[status] || 'bg-gray-400'}`} style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">{t('analytics.noRecoveryData')}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ─── 4. BAR CHARTS: Disease Prevalence + Referral Reasons ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Disease Prevalence */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="text-base font-semibold flex items-center gap-2 mb-4">
            <Stethoscope className="w-4 h-4 text-primary" />
            {t('analytics.diseasePrevalence')}
          </h2>
          {diseaseData.length === 0 ? (
            <EmptyState message={t('analytics.noDiagnosisData')} />
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={diseaseData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={120} />
                <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: 12 }} />
                <Bar dataKey="value" fill="#0ea5e9" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Referral Reasons */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="text-base font-semibold flex items-center gap-2 mb-4">
            <ClipboardList className="w-4 h-4 text-primary" />
            {t('analytics.topReferralReasons')}
          </h2>
          {referralReasonData.length === 0 ? (
            <EmptyState message={t('analytics.noReferralReasonData')} />
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={referralReasonData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} allowDecimals={false} />
                <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={120} />
                <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: 12 }} />
                <Bar dataKey="value" fill="#14b8a6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
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

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <Activity className="w-8 h-8 mb-2 opacity-30" />
      <p className="text-sm text-center max-w-xs">{message}</p>
    </div>
  );
}
// Build timestamp: 2026-05