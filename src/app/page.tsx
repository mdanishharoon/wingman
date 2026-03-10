'use client';

import { useEffect, useState, useCallback } from 'react';
import { formatDistanceToNow, parseISO, format } from 'date-fns';
import {
  CheckCircle,
  XCircle,
  Tag,
  Loader2,
  RefreshCw,
  Mail,
  Calendar,
  DollarSign,
  Search,
  X,
  Sparkles,
  Check,
  Send,
  CornerUpRight,
  Archive,
  Filter,
  ChevronDown,
  MessageSquare,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';

type ChurnEvent = {
  id: string;
  created_at: string;
  slack_message_ts: string;
  event_type: 'cancellation' | 'discount_accepted';
  customer_email: string;
  customer_since: string | null;
  plan_amount_dollars: number | null;
  feedback: string | null;
  survey_response: string | null;
  discount_amount: string | null;
  ai_score_passed: boolean | null;
  ai_score_reason: string | null;
  status: 'pending' | 'skipped' | 'contacted';
};

type EmailDraft = {
  subject: string;
  body: string;
};

export default function Dashboard() {
  const [events, setEvents] = useState<ChurnEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchingNew, setFetchingNew] = useState(false);
  const [streamMessage, setStreamMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'skipped' | 'contacted' | 'discounts'>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest' | 'highest_plan'>('newest');
  const [hideEmptyFeedback, setHideEmptyFeedback] = useState(false);

  // Email modal state
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailModalEvent, setEmailModalEvent] = useState<ChurnEvent | null>(null);
  const [emailDraft, setEmailDraft] = useState<EmailDraft | null>(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState('');

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/churn-events');
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const handleFetchNewEvents = async () => {
    if (fetchingNew) return;
    setFetchingNew(true);
    setStreamMessage('Connecting...');

    const eventSource = new EventSource('/api/stream-events');

    eventSource.onmessage = () => { };

    eventSource.addEventListener('info', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setStreamMessage(data.message);
    });

    eventSource.addEventListener('newEvent', (e: MessageEvent) => {
      const newEvent: ChurnEvent = JSON.parse(e.data);
      setEvents(prev => {
        if (prev.some(event => event.id === newEvent.id)) return prev;
        return [newEvent, ...prev];
      });
      setStreamMessage(`Processed: ${newEvent.customer_email}`);
    });

    eventSource.addEventListener('done', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setStreamMessage(null);
      setFetchingNew(false);
      eventSource.close();
      if (data.processed > 0) {
        fetchEvents();
      }
    });

    eventSource.addEventListener('error', () => {
      setStreamMessage(null);
      setFetchingNew(false);
      eventSource.close();
    });
  };

  const handleDraftEmail = useCallback(async (event: ChurnEvent) => {
    setEmailModalEvent(event);
    setRecipientEmail(event.customer_email || '');
    setEmailModalOpen(true);
    setEmailDraft(null);
    setDraftLoading(true);
    setCopied(false);

    try {
      const res = await fetch('/api/draft-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerEmail: event.customer_email,
          feedback: event.feedback,
          surveyResponse: event.survey_response,
          planAmountDollars: event.plan_amount_dollars,
        }),
      });
      const data = await res.json();
      if (data.subject && data.body) {
        setEmailDraft(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDraftLoading(false);
    }
  }, []);

  const handleSendEmail = useCallback(async () => {
    if (!emailDraft || !emailModalEvent || !recipientEmail) return;
    setDraftLoading(true);

    try {
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipientEmail,
          subject: emailDraft.subject,
          text: emailDraft.body,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setCopied(true);
        await handleUpdateStatus(emailModalEvent.id, 'contacted');
        setTimeout(() => {
          setCopied(false);
          setEmailModalOpen(false);
        }, 2000);
      } else {
        alert("Failed to send email: " + data.error);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to send email");
    } finally {
      setDraftLoading(false);
    }
  }, [emailDraft, emailModalEvent, recipientEmail]);

  const handleUpdateStatus = async (id: string, newStatus: 'pending' | 'skipped' | 'contacted') => {
    setEvents(prev => prev.map(event => event.id === id ? { ...event, status: newStatus } : event));
    try {
      const res = await fetch(`/api/churn-events/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) fetchEvents();
    } catch {
      fetchEvents();
    }
  };

  // Filtering
  const filterEvents = (list: ChurnEvent[]) => {
    let filtered = list;
    if (hideEmptyFeedback) {
      filtered = filtered.filter(e => {
        if (!e.feedback) return false;
        const fbLower = e.feedback.toLowerCase().trim();
        return fbLower !== '' && fbLower !== 'none provided' && fbLower !== 'null';
      });
    }
    if (!searchQuery.trim()) return filtered;
    const q = searchQuery.toLowerCase();
    return filtered.filter(e =>
      e.customer_email.toLowerCase().includes(q) ||
      (e.feedback && e.feedback.toLowerCase().includes(q)) ||
      (e.survey_response && e.survey_response.toLowerCase().includes(q)) ||
      (e.ai_score_reason && e.ai_score_reason.toLowerCase().includes(q))
    );
  };

  // Sorting
  const sortEvents = (list: ChurnEvent[]) => {
    return [...list].sort((a, b) => {
      if (sortOrder === 'newest') return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortOrder === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (sortOrder === 'highest_plan') return (b.plan_amount_dollars || 0) - (a.plan_amount_dollars || 0);
      return 0;
    });
  };

  const pendingEvents = sortEvents(filterEvents(events.filter(e => e.status === 'pending' && e.event_type === 'cancellation')));
  const skippedEvents = sortEvents(filterEvents(events.filter(e => e.status === 'skipped' && e.event_type === 'cancellation')));
  const contactedEvents = sortEvents(filterEvents(events.filter(e => e.status === 'contacted' && e.event_type === 'cancellation')));
  const discountEvents = sortEvents(filterEvents(events.filter(e => e.event_type === 'discount_accepted')));

  const totalPending = events.filter(e => e.status === 'pending' && e.event_type === 'cancellation').length;
  const totalSkipped = events.filter(e => e.status === 'skipped' && e.event_type === 'cancellation').length;
  const totalContacted = events.filter(e => e.status === 'contacted' && e.event_type === 'cancellation').length;

  const getFormatDistance = (dateString: string | null) => {
    if (!dateString) return 'Unknown';
    try {
      return formatDistanceToNow(parseISO(dateString), { addSuffix: true });
    } catch {
      return dateString;
    }
  };

  const getFormattedDate = (dateString: string) => {
    try {
      return format(parseISO(dateString), 'MMM d, yyyy · h:mm a');
    } catch {
      return dateString;
    }
  };

  const tabs = [
    { key: 'pending' as const, label: 'Pending', count: pendingEvents.length, icon: <Zap className="w-3.5 h-3.5" /> },
    { key: 'skipped' as const, label: 'Skipped', count: skippedEvents.length, icon: <XCircle className="w-3.5 h-3.5" /> },
    { key: 'contacted' as const, label: 'Contacted', count: contactedEvents.length, icon: <Send className="w-3.5 h-3.5" /> },
    { key: 'discounts' as const, label: 'Discounts', count: discountEvents.length, icon: <Tag className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="min-h-screen bg-[var(--background)] text-zinc-100">

      {/* ─── Header ─── */}
      <header className="sticky top-0 z-30 bg-[var(--background)]/80 backdrop-blur-2xl border-b border-white/[0.04]">
        <div className="max-w-[1400px] mx-auto px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="text-[15px] font-semibold tracking-tight text-white">Wingman</span>
            <span className="text-[11px] font-medium text-zinc-500 bg-zinc-800/60 px-2 py-0.5 rounded-full">imagine.art</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchEvents}
              className="p-2 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${loading && !fetchingNew ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleFetchNewEvents}
              disabled={fetchingNew}
              className="flex items-center gap-2 h-9 px-4 rounded-full bg-violet-600 hover:bg-violet-500 text-white text-[13px] font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed min-w-[120px] justify-center shadow-lg shadow-violet-600/20"
            >
              {fetchingNew ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span className="truncate max-w-[140px]">{streamMessage || 'Fetching...'}</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  Sync Events
                </>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto px-8 py-8">

        {/* ─── Stats ─── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <StatCard label="Pending Review" value={totalPending} icon={<Users className="w-4 h-4" />} accent="violet" />
          <StatCard label="Skipped" value={totalSkipped} icon={<XCircle className="w-4 h-4" />} accent="zinc" />
          <StatCard label="Contacted" value={totalContacted} icon={<MessageSquare className="w-4 h-4" />} accent="emerald" />
          <StatCard label="Discounts" value={discountEvents.length} icon={<TrendingUp className="w-4 h-4" />} accent="amber" />
        </div>

        {/* ─── Toolbar ─── */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 mb-6">
          {/* Tabs */}
          <div className="flex gap-1 p-1 rounded-full bg-[var(--card)] border border-white/[0.04]">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 h-8 px-4 rounded-full text-[13px] font-medium transition-all duration-200
                  ${activeTab === tab.key
                    ? 'bg-white/[0.08] text-white shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-300'
                  }`}
              >
                {tab.icon}
                {tab.label}
                <span className={`text-[11px] ml-0.5 tabular-nums ${activeTab === tab.key ? 'text-zinc-400' : 'text-zinc-600'}`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2 w-full lg:w-auto">
            <div className="relative flex-1 lg:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full lg:w-56 h-9 pl-9 pr-3 bg-[var(--card)] border border-white/[0.04] rounded-full text-[13px] text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-violet-500/30 transition-colors"
              />
            </div>
            <div className="relative">
              <select
                value={sortOrder}
                onChange={e => setSortOrder(e.target.value as any)}
                className="h-9 pl-3 pr-8 bg-[var(--card)] border border-white/[0.04] rounded-full text-[13px] text-zinc-300 focus:outline-none focus:border-violet-500/30 appearance-none cursor-pointer"
              >
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="highest_plan">Highest Plan</option>
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500 pointer-events-none" />
            </div>
            <button
              onClick={() => setHideEmptyFeedback(!hideEmptyFeedback)}
              className={`flex items-center gap-1.5 h-9 px-3.5 rounded-full text-[13px] font-medium border transition-all
                ${hideEmptyFeedback
                  ? 'bg-violet-600/15 border-violet-500/25 text-violet-300'
                  : 'bg-[var(--card)] border-white/[0.04] text-zinc-500 hover:text-zinc-300'
                }`}
              title="Filter to events with feedback only"
            >
              <Filter className="w-3.5 h-3.5" />
              Feedback
            </button>
          </div>
        </div>

        {/* ─── Event List ─── */}
        {loading && events.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-32 gap-3">
            <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
            <p className="text-sm text-zinc-500">Loading events...</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activeTab === 'pending' && pendingEvents.length === 0 && <EmptyState message="No pending events to review" />}
            {activeTab === 'pending' && pendingEvents.map((event, i) => (
              <EventCard key={event.id} event={event} type="pending" index={i} getFormatDistance={getFormatDistance} getFormattedDate={getFormattedDate} onDraftEmail={handleDraftEmail} onUpdateStatus={handleUpdateStatus} />
            ))}

            {activeTab === 'skipped' && skippedEvents.length === 0 && <EmptyState message="No skipped events" />}
            {activeTab === 'skipped' && skippedEvents.map((event, i) => (
              <EventCard key={event.id} event={event} type="skipped" index={i} getFormattedDate={getFormattedDate} onUpdateStatus={handleUpdateStatus} />
            ))}

            {activeTab === 'contacted' && contactedEvents.length === 0 && <EmptyState message="No users contacted yet" />}
            {activeTab === 'contacted' && contactedEvents.map((event, i) => (
              <EventCard key={event.id} event={event} type="contacted" index={i} getFormatDistance={getFormatDistance} getFormattedDate={getFormattedDate} onUpdateStatus={handleUpdateStatus} />
            ))}

            {activeTab === 'discounts' && discountEvents.length === 0 && <EmptyState message="No discounts accepted" />}
            {activeTab === 'discounts' && discountEvents.map((event, i) => (
              <EventCard key={event.id} event={event} type="discount" index={i} getFormattedDate={getFormattedDate} />
            ))}
          </div>
        )}
      </main>

      {/* ─── Email Draft Modal ─── */}
      {emailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => setEmailModalOpen(false)} />
          <div className="animate-slideUp relative w-full max-w-2xl bg-[#141416] border border-white/[0.06] rounded-2xl shadow-2xl shadow-black/50 max-h-[85vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.04]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="text-[15px] font-semibold text-white">Draft Win-Back Email</h2>
                  <p className="text-[11px] text-zinc-500 mt-0.5">AI-generated from user feedback</p>
                </div>
              </div>
              <button onClick={() => setEmailModalOpen(false)} className="p-1.5 rounded-lg hover:bg-white/[0.04] transition-colors text-zinc-500 hover:text-zinc-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {draftLoading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <div className="w-10 h-10 rounded-full bg-violet-500/10 flex items-center justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-violet-400" />
                  </div>
                  <p className="text-sm text-zinc-500">AI is drafting your email...</p>
                </div>
              ) : emailDraft ? (
                <div className="space-y-4">
                  <FieldBlock label="To">
                    <input
                      type="email"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      className="w-full bg-white/[0.03] rounded-xl px-4 py-3 border border-white/[0.06] text-[13px] text-zinc-200 font-medium focus:outline-none focus:border-violet-500/30 transition-colors"
                    />
                  </FieldBlock>
                  <FieldBlock label="Subject">
                    <input
                      type="text"
                      value={emailDraft.subject}
                      onChange={(e) => setEmailDraft({ ...emailDraft, subject: e.target.value })}
                      className="w-full bg-white/[0.03] rounded-xl px-4 py-3 border border-white/[0.06] text-[13px] text-zinc-200 font-medium focus:outline-none focus:border-violet-500/30 transition-colors"
                    />
                  </FieldBlock>
                  <FieldBlock label="Body">
                    <textarea
                      value={emailDraft.body}
                      onChange={(e) => setEmailDraft({ ...emailDraft, body: e.target.value })}
                      rows={12}
                      className="w-full bg-white/[0.03] rounded-xl px-4 py-4 border border-white/[0.06] text-[13px] text-zinc-300 leading-relaxed focus:outline-none focus:border-violet-500/30 transition-colors resize-y"
                    />
                  </FieldBlock>
                </div>
              ) : (
                <div className="flex items-center justify-center py-16">
                  <p className="text-sm text-zinc-500">Failed to generate draft. Try again.</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            {emailDraft && (
              <div className="px-6 py-4 border-t border-white/[0.04] flex items-center justify-between">
                <button
                  onClick={() => handleDraftEmail(emailModalEvent!)}
                  className="flex items-center gap-2 h-9 px-4 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] transition-colors text-[13px] text-zinc-300"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Regenerate
                </button>
                <button
                  onClick={handleSendEmail}
                  disabled={draftLoading}
                  className="flex items-center gap-2 h-9 px-5 rounded-full bg-violet-600 hover:bg-violet-500 disabled:opacity-50 transition-all text-[13px] font-medium text-white min-w-[120px] justify-center shadow-lg shadow-violet-600/20"
                >
                  {draftLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : copied ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  {copied ? 'Sent!' : 'Send Email'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 block mb-2">{label}</label>
      {children}
    </div>
  );
}

function StatCard({ label, value, icon, accent }: { label: string; value: number; icon: React.ReactNode; accent: string }) {
  const accentMap: Record<string, string> = {
    violet: 'text-violet-400 bg-violet-500/10 border-violet-500/[0.08]',
    zinc: 'text-zinc-400 bg-white/[0.03] border-white/[0.04]',
    emerald: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/[0.08]',
    amber: 'text-amber-400 bg-amber-500/10 border-amber-500/[0.08]',
  };
  const iconBgMap: Record<string, string> = {
    violet: 'bg-violet-500/15 text-violet-400',
    zinc: 'bg-zinc-700/40 text-zinc-400',
    emerald: 'bg-emerald-500/15 text-emerald-400',
    amber: 'bg-amber-500/15 text-amber-400',
  };

  return (
    <div className={`rounded-2xl border p-5 ${accentMap[accent]} transition-all hover:scale-[1.01]`}>
      <div className="flex items-center justify-between mb-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconBgMap[accent]}`}>
          {icon}
        </div>
      </div>
      <p className="text-3xl font-bold tracking-tight text-white">{value}</p>
      <p className="text-[12px] text-zinc-500 mt-1 font-medium">{label}</p>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 rounded-2xl border border-dashed border-white/[0.06] bg-white/[0.01]">
      <div className="w-10 h-10 rounded-full bg-white/[0.04] flex items-center justify-center text-zinc-600 mb-3">
        <Mail className="w-4 h-4" />
      </div>
      <p className="text-[13px] text-zinc-600">{message}</p>
    </div>
  );
}

function EventCard({ event, type, index, getFormatDistance, getFormattedDate, onDraftEmail, onUpdateStatus }: any) {
  const planColor = event.plan_amount_dollars && event.plan_amount_dollars >= 30
    ? 'text-amber-400 bg-amber-500/10 border-amber-500/20'
    : 'text-zinc-400 bg-white/[0.04] border-white/[0.06]';

  return (
    <div
      className="animate-fadeIn group bg-[var(--card)] border border-white/[0.04] rounded-xl p-5 transition-all hover:bg-[var(--card-hover)] hover:border-white/[0.08]"
      style={{ animationDelay: `${index * 30}ms` }}
    >
      <div className="flex flex-col lg:flex-row lg:items-start gap-4">
        {/* Left */}
        <div className="flex-1 min-w-0">
          {/* Top row: email + metadata */}
          <div className="flex items-start gap-3 mb-3">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-zinc-700 to-zinc-800 border border-white/[0.06] flex items-center justify-center text-zinc-400 shrink-0 text-[13px] font-semibold uppercase">
              {event.customer_email.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-[14px] font-semibold text-white truncate">{event.customer_email}</h3>

                {event.plan_amount_dollars !== null && (
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full border ${planColor}`}>
                    <DollarSign className="w-3 h-3" />
                    {event.plan_amount_dollars}/mo
                  </span>
                )}
              </div>

              <div className="flex items-center gap-3 text-[11px] text-zinc-500 mt-1 flex-wrap">
                {type === 'pending' && event.customer_since && getFormatDistance && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Customer {getFormatDistance(event.customer_since)}
                  </span>
                )}
                <span>{getFormattedDate(event.created_at)}</span>
                {type === 'discount' && event.discount_amount && (
                  <span className="flex items-center gap-1 text-amber-400">
                    <Tag className="w-3 h-3" />
                    {event.discount_amount}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Feedback block */}
          {type !== 'discount' && (
            <div className="ml-12 bg-white/[0.02] rounded-xl px-4 py-3 border border-white/[0.04]">
              <p className="text-[12px] text-zinc-400 leading-relaxed">
                {event.feedback || event.survey_response || 'No feedback provided'}
              </p>
            </div>
          )}
        </div>

        {/* Right: AI + Actions */}
        <div className="flex flex-col gap-2 lg:w-72 shrink-0">
          {/* AI Decision */}
          {type !== 'discount' && (
            <div className={`rounded-xl px-4 py-3 border ${type === 'pending'
              ? 'bg-emerald-500/[0.04] border-emerald-500/[0.08]'
              : type === 'contacted'
                ? 'bg-violet-500/[0.04] border-violet-500/[0.08]'
                : 'bg-white/[0.02] border-white/[0.04]'
              }`}>
              <div className={`flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider mb-1.5 ${type === 'pending' ? 'text-emerald-400' : type === 'contacted' ? 'text-violet-400' : 'text-zinc-500'
                }`}>
                {type === 'pending' ? <CheckCircle className="w-3 h-3" /> : type === 'contacted' ? <Send className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                {type === 'contacted' ? 'Contacted' : 'AI Decision'}
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed">
                {event.ai_score_reason || 'Automatically processed.'}
              </p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            {type === 'pending' && onDraftEmail && (
              <button
                onClick={() => onDraftEmail(event)}
                className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-full bg-violet-600/15 border border-violet-500/20 text-violet-300 text-[12px] font-medium hover:bg-violet-600/25 transition-colors"
              >
                <Sparkles className="w-3 h-3" />
                Draft Email
              </button>
            )}
            {type === 'pending' && onUpdateStatus && (
              <button
                onClick={() => onUpdateStatus(event.id, 'skipped')}
                title="Skip"
                className="flex items-center justify-center w-8 h-8 rounded-full border border-white/[0.06] text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04] transition-colors"
              >
                <Archive className="w-3.5 h-3.5" />
              </button>
            )}
            {type === 'skipped' && onUpdateStatus && (
              <button
                onClick={() => onUpdateStatus(event.id, 'pending')}
                className="flex-1 flex items-center justify-center gap-1.5 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/15 text-emerald-400 text-[12px] font-medium hover:bg-emerald-500/20 transition-colors"
              >
                <CornerUpRight className="w-3 h-3" />
                Move to Pending
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
