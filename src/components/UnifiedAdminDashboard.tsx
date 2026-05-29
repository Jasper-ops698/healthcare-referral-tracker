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
} from 'lucide-react';
import {
  getAllReferralsV2, sendAIChat, generateAIExportReport,
} from '@/lib/apiClient';
import type { ChatMessage } from '@/lib/apiClient';
import type { ReferralV2 } from '@/types';
import { toast } from 'sonner';
import { LOGO_BASE64 } from '@/lib/logoBase64';

const COLORS = ['#0ea5e9', '#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6', '#f43f5e', '#06b6d4', '#84cc16'];
const GENDER_COLORS = { male: '#0ea5e9', female: '#ec4899', other: '#94a3b8' };
const AGE_COLORS = ['#14b8a6', '#0ea5e9', '#f59e0b', '#ec4899', '#f43f5e'];

export default function UnifiedAdminDashboard() {
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

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const res = await getAllReferralsV2();
      if (res.success) setReferrals(((res.data as any)?.referrals || []) as ReferralV2[]);
    } catch (e) { console.error('Load failed:', e); }
    finally { setLoading(false); }
  };

  // ─── 1. LINE CHART: Referral activities per facility over time ───
  const lineChartData = useMemo(() => {
    if (referrals.length === 0) return [];

    // Group by time period and facility
    const timeMap = new Map<string, Map<string, number>>();

    referrals.forEach(r => {
      const date = new Date(r.createdAt);
      let key: string;
      if (period === 'monthly') {
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      } else {
        key = `${date.getFullYear()}`;
      }

      const facility = r.destinationStationName || r.sourceStationName || 'Unknown';
      if (!timeMap.has(key)) timeMap.set(key, new Map());
      const fMap = timeMap.get(key)!;
      fMap.set(facility, (fMap.get(facility) || 0) + 1);
    });

    // Get unique facilities (top 6)
    const facilityCounts = new Map<string, number>();
    referrals.forEach(r => {
      const f = r.destinationStationName || r.sourceStationName || 'Unknown';
      facilityCounts.set(f, (facilityCounts.get(f) || 0) + 1);
    });
    const topFacilities = Array.from(facilityCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name]) => name);

    // Build chart data rows
    const sortedKeys = Array.from(timeMap.keys()).sort();
    return sortedKeys.map(key => {
      const row: Record<string, string | number> = { period: key };
      topFacilities.forEach(f => {
        row[f] = timeMap.get(key)?.get(f) || 0;
      });
      return row;
    });
  }, [referrals, period]);

  const facilityNames = useMemo(() => {
    if (lineChartData.length === 0) return [];
    return Object.keys(lineChartData[0]).filter(k => k !== 'period');
  }, [lineChartData]);

  // ─── 2. PIE CHARTS: Gender & Age distribution ───
  const genderData = useMemo(() => {
    const counts: Record<string, number> = {};
    referrals.forEach(r => {
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
    referrals.forEach(r => {
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
    referrals.forEach(r => {
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
    referrals.forEach(r => {
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

  // ─── KPI Summary ───
  const kpi = useMemo(() => ({
    total: referrals.length,
    emergency: referrals.filter(r => r.urgency === 'emergency').length,
    urgent: referrals.filter(r => r.urgency === 'urgent').length,
    completed: referrals.filter(r => r.status === 'counter-referral-created' || r.status === 'completed').length,
  }), [referrals]);

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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-primary" />
            Referral Analytics
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Activity across all facilities</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowExport(!showExport)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border hover:bg-muted transition-colors text-sm font-medium"
          >
            <FileText className="w-4 h-4" /> Export Report
          </button>
          <button
            onClick={() => setChatOpen(!chatOpen)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
          >
            <Sparkles className="w-4 h-4" /> AI Advisor
          </button>
        </div>
      </div>

      {/* Export Panel */}
      {showExport && (
        <div className="bg-card rounded-xl border border-border p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Download className="w-4 h-4" /> Generate Custom Report
          </h3>
          <p className="text-xs text-muted-foreground">Describe what you want in the report. AI will analyze all data and generate it.</p>
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

      {/* AI Chat Panel — Floating Overlay */}
      {chatOpen && (
        <div className="fixed bottom-4 right-4 z-50 bg-card rounded-xl border border-primary/30 shadow-2xl flex flex-col" style={{ width: 'min(420px, calc(100vw - 2rem))', height: 'min(520px, calc(100vh - 6rem))' }}>
          <div className="px-4 py-3 border-b border-primary/20 bg-primary/5 flex items-center justify-between shrink-0">
            <h3 className="text-sm font-bold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" /> HealthTrack AI Advisor
            </h3>
            <button onClick={() => setChatOpen(false)} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded hover:bg-muted transition-colors">Close</button>
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
              placeholder="Ask about disease trends, station performance, referrals..."
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

      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Kpi icon={ClipboardList} color="text-primary" bg="bg-primary/10" label="Total Referrals" value={kpi.total} />
        <Kpi icon={HeartPulse} color="text-red-600" bg="bg-red-50" label="Emergencies" value={kpi.emergency} />
        <Kpi icon={AlertTriangle} color="text-amber-600" bg="bg-amber-50" label="Urgent" value={kpi.urgent} />
        <Kpi icon={TrendingUp} color="text-emerald-600" bg="bg-emerald-50" label="Completed" value={kpi.completed} />
      </div>

      {/* ─── 1. LINE CHART: Referral Activities Per Facility ─── */}
      <div className="bg-card rounded-xl border border-border p-5">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <h2 className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-primary" />
            Referral Activities Per Facility
          </h2>
          <div className="flex items-center gap-2">
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => setPeriod('monthly')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${period === 'monthly' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              >
                Monthly
              </button>
              <button
                onClick={() => setPeriod('yearly')}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${period === 'yearly' ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              >
                Yearly
              </button>
            </div>
          </div>
        </div>
        {lineChartData.length === 0 ? (
          <EmptyState message="No referral data yet. Activities will appear here as collectors submit referrals." />
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <AreaChart data={lineChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="period" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
              <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {facilityNames.map((name, i) => (
                <Area
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={COLORS[i % COLORS.length]}
                  fill={COLORS[i % COLORS.length]}
                  fillOpacity={0.1}
                  strokeWidth={2}
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
            Gender Distribution
          </h2>
          {genderData.length === 0 ? (
            <EmptyState message="No gender data available" />
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
            Age Distribution
          </h2>
          {ageData.length === 0 ? (
            <EmptyState message="No age data available" />
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

      {/* ─── 3. BAR CHARTS: Disease Prevalence + Referral Reasons ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Disease Prevalence */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="text-base font-semibold flex items-center gap-2 mb-4">
            <Stethoscope className="w-4 h-4 text-primary" />
            Disease Prevalence (Initial Diagnosis)
          </h2>
          {diseaseData.length === 0 ? (
            <EmptyState message="No diagnosis data available" />
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
            Top Referral Reasons
          </h2>
          {referralReasonData.length === 0 ? (
            <EmptyState message="No referral reason data available" />
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
// Build timestamp: 2026-05-28T10:54:14Z
