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
  ArrowUpDown,
  X,
  Sparkles,
  Copy,
  Check,
  Send,
  CornerUpRight,
  Archive
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

    eventSource.onmessage = (event) => {
      // Catch-all for unnamed events if any
    };

    eventSource.addEventListener('info', (e: MessageEvent) => {
      const data = JSON.parse(e.data);
      setStreamMessage(data.message);
    });

    eventSource.addEventListener('newEvent', (e: MessageEvent) => {
      const newEvent: ChurnEvent = JSON.parse(e.data);
      // Prepend the new event to the list so it shows up immediately at the top
      setEvents(prev => {
        // Prevent duplicates just in case
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
        // Soft refresh just to ensure absolute sync 
        fetchEvents();
      }
    });

    eventSource.addEventListener('error', (e: MessageEvent) => {
      console.error("SSE Error:", e);
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
        setCopied(true); // Reusing the 'copied' state for the 'Sent!' animation

        // Update the status to 'contacted' proactively
        await handleUpdateStatus(emailModalEvent.id, 'contacted');

        setTimeout(() => {
          setCopied(false);
          setEmailModalOpen(false); // Close the modal on success
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
    // Optimistic UI update
    setEvents(prev => prev.map(event => event.id === id ? { ...event, status: newStatus } : event));

    try {
      const res = await fetch(`/api/churn-events/${id}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        // Revert on failure
        fetchEvents();
      }
    } catch (err) {
      console.error("Failed to update status", err);
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
  const totalDiscounts = events.filter(e => e.event_type === 'discount_accepted').length;

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

  return (
    <div className="min-h-screen bg-[#060606] text-zinc-100">

      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-[#060606]/80 border-b border-zinc-800/50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Send className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white">Wingman</h1>
              <p className="text-xs text-zinc-500">imagine.art churn triage</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleFetchNewEvents}
              disabled={fetchingNew}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 transition-all text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed min-w-[140px] justify-center"
            >
              {fetchingNew ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                  <span className="truncate max-w-[150px]">{streamMessage || 'Fetching...'}</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                  Fetch New
                </>
              )}
            </button>
            <button
              onClick={fetchEvents}
              className="p-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors text-zinc-400"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading && !fetchingNew ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">

        {/* Stats Bar */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <StatCard label="Pending" value={totalPending} color="emerald" />
          <StatCard label="Skipped" value={totalSkipped} color="zinc" />
          <StatCard label="Contacted" value={totalContacted} color="blue" />
          <StatCard label="Discounts" value={discountEvents.length} color="violet" />
        </div>

        {/* Tabs + Search/Sort */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
          <div className="flex flex-wrap gap-1 p-1 bg-zinc-900/80 rounded-xl border border-zinc-800/50">
            <TabButton
              active={activeTab === 'pending'}
              onClick={() => setActiveTab('pending')}
              icon={<CheckCircle className="w-3.5 h-3.5" />}
              label="Pending"
              count={pendingEvents.length}
            />
            <TabButton
              active={activeTab === 'skipped'}
              onClick={() => setActiveTab('skipped')}
              icon={<XCircle className="w-3.5 h-3.5" />}
              label="Skipped"
              count={skippedEvents.length}
            />
            <TabButton
              active={activeTab === 'contacted'}
              onClick={() => setActiveTab('contacted')}
              icon={<Send className="w-3.5 h-3.5" />}
              label="Contacted"
              count={contactedEvents.length}
            />
            <TabButton
              active={activeTab === 'discounts'}
              onClick={() => setActiveTab('discounts')}
              icon={<Tag className="w-3.5 h-3.5" />}
              label="Discounts"
              count={discountEvents.length}
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <div className="relative flex-1 sm:flex-none">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" />
              <input
                type="text"
                placeholder="Search emails, feedback..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full sm:w-64 pl-9 pr-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-zinc-600 transition-colors"
              />
            </div>
            <select
              value={sortOrder}
              onChange={e => setSortOrder(e.target.value as any)}
              className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-sm text-zinc-300 focus:outline-none focus:border-zinc-600 appearance-none cursor-pointer"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="highest_plan">Highest plan</option>
            </select>

            <button
              onClick={() => setHideEmptyFeedback(!hideEmptyFeedback)}
              className={`px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${hideEmptyFeedback
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-300'
                }`}
              title="Hide events with no feedback"
            >
              Has Feedback
            </button>
          </div>
        </div>

        {/* Event List */}
        {loading && events.length === 0 ? (
          <div className="flex justify-center py-24">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-600" />
          </div>
        ) : (
          <div className="space-y-3">
            {activeTab === 'pending' && pendingEvents.length === 0 && <EmptyState message="No pending events to review." />}
            {activeTab === 'pending' && pendingEvents.map(event => (
              <EventCard key={event.id} event={event} type="pending" getFormatDistance={getFormatDistance} getFormattedDate={getFormattedDate} onDraftEmail={handleDraftEmail} onUpdateStatus={handleUpdateStatus} />
            ))}

            {activeTab === 'skipped' && skippedEvents.length === 0 && <EmptyState message="No skipped events." />}
            {activeTab === 'skipped' && skippedEvents.map(event => (
              <EventCard key={event.id} event={event} type="skipped" getFormattedDate={getFormattedDate} onUpdateStatus={handleUpdateStatus} />
            ))}

            {activeTab === 'contacted' && contactedEvents.length === 0 && <EmptyState message="No users contacted yet." />}
            {activeTab === 'contacted' && contactedEvents.map(event => (
              <EventCard key={event.id} event={event} type="contacted" getFormatDistance={getFormatDistance} getFormattedDate={getFormattedDate} onUpdateStatus={handleUpdateStatus} />
            ))}

            {activeTab === 'discounts' && discountEvents.length === 0 && <EmptyState message="No discounts accepted." />}
            {activeTab === 'discounts' && discountEvents.map(event => (
              <EventCard key={event.id} event={event} type="discount" getFormattedDate={getFormattedDate} />
            ))}
          </div>
        )}
      </main>

      {/* Email Draft Modal */}
      {emailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setEmailModalOpen(false)} />
          <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-700/50 rounded-2xl shadow-2xl max-h-[85vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-blue-500 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-white">Draft Win-Back Email</h2>
                </div>
              </div>
              <button onClick={() => setEmailModalOpen(false)} className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors text-zinc-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto px-6 py-5">
              {draftLoading ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
                  <p className="text-sm text-zinc-500">AI is drafting your email...</p>
                </div>
              ) : emailDraft ? (
                <div className="space-y-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 block mb-1.5">To</label>
                    <input
                      type="email"
                      value={recipientEmail}
                      onChange={(e) => setRecipientEmail(e.target.value)}
                      className="w-full bg-black/40 rounded-lg p-3 border border-zinc-800/50 text-sm text-zinc-200 font-medium focus:outline-none focus:border-zinc-700 transition-colors"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 block mb-1.5">Subject</label>
                    <div className="bg-black/40 rounded-lg p-3 border border-zinc-800/50">
                      <p className="text-sm text-zinc-200 font-medium">{emailDraft.subject}</p>
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest text-zinc-500 block mb-1.5">Body</label>
                    <div className="bg-black/40 rounded-lg p-4 border border-zinc-800/50">
                      <div className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap">
                        {emailDraft.body}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-center py-16">
                  <p className="text-sm text-zinc-500">Failed to generate draft. Try again.</p>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            {emailDraft && (
              <div className="px-6 py-4 border-t border-zinc-800 flex items-center justify-between">
                <button
                  onClick={() => handleDraftEmail(emailModalEvent!)}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 transition-colors text-sm text-zinc-300"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Regenerate
                </button>
                <button
                  onClick={handleSendEmail}
                  disabled={draftLoading}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 transition-colors text-sm font-medium text-white min-w-[130px] justify-center"
                >
                  {draftLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : copied ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Send className="w-3.5 h-3.5" />
                  )}
                  {copied ? 'Email sent!' : 'Send Email'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Sub-components ----------

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: any = {
    emerald: 'text-emerald-400 bg-emerald-500/5 border-emerald-500/10',
    zinc: 'text-zinc-400 bg-zinc-800/50 border-zinc-700/30',
    blue: 'text-blue-400 bg-blue-500/5 border-blue-500/10',
    violet: 'text-violet-400 bg-violet-500/5 border-violet-500/10',
  };
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs opacity-60 mt-0.5">{label}</p>
    </div>
  );
}

function TabButton({ active, onClick, icon, label, count }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg transition-all duration-150 text-sm font-medium
        ${active ? 'bg-zinc-800 text-white shadow-sm' : 'text-zinc-500 hover:text-zinc-300'}
      `}
    >
      {icon}
      {label}
      <span className={`ml-1 text-xs ${active ? 'text-zinc-400' : 'text-zinc-600'}`}>{count}</span>
    </button>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-20 rounded-2xl border border-zinc-800/50 border-dashed bg-zinc-900/20">
      <p className="text-sm text-zinc-600">{message}</p>
    </div>
  );
}

function EventCard({ event, type, getFormatDistance, getFormattedDate, onDraftEmail, onUpdateStatus }: any) {
  return (
    <div className="group bg-zinc-900/40 border border-zinc-800/60 rounded-xl p-5 transition-all hover:bg-zinc-900/70 hover:border-zinc-700/50">
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        {/* Left Side */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700/40 flex items-center justify-center text-zinc-500 shrink-0">
              <Mail className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold text-zinc-100 truncate">{event.customer_email}</h3>

                {/* Actions container */}
                <div className="flex items-center gap-1">
                  {type === 'pending' && onDraftEmail && (
                    <button
                      onClick={() => onDraftEmail(event)}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-violet-500/10 border border-violet-500/20 text-violet-400 text-[11px] font-medium hover:bg-violet-500/20 transition-colors"
                    >
                      <Sparkles className="w-3 h-3" />
                      Draft Email
                    </button>
                  )}

                  {type === 'pending' && onUpdateStatus && (
                    <button
                      onClick={() => onUpdateStatus(event.id, 'skipped')}
                      title="Move to Skipped"
                      className="flex items-center justify-center w-6 h-6 rounded-md text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
                    >
                      <Archive className="w-3.5 h-3.5" />
                    </button>
                  )}

                  {type === 'skipped' && onUpdateStatus && (
                    <button
                      onClick={() => onUpdateStatus(event.id, 'pending')}
                      className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium hover:bg-emerald-500/20 transition-colors"
                    >
                      <CornerUpRight className="w-3 h-3" />
                      Move to Pending
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-zinc-500 mt-1 flex-wrap">
                {event.plan_amount_dollars !== null && (
                  <span className="flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    ${event.plan_amount_dollars}/mo
                  </span>
                )}
                {type === 'pending' && event.customer_since && getFormatDistance && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {getFormatDistance(event.customer_since)}
                  </span>
                )}
                {type === 'discount' && event.discount_amount && (
                  <span className="flex items-center gap-1 text-blue-400">
                    <Tag className="w-3 h-3" />
                    {event.discount_amount}
                  </span>
                )}
                <span className="text-zinc-600">{getFormattedDate(event.created_at)}</span>
              </div>
            </div>
          </div>

          {/* Feedback */}
          {type !== 'discount' && (
            <div className="ml-12 bg-black/30 rounded-lg px-3.5 py-2.5 border border-zinc-800/40">
              <p className="text-xs text-zinc-400 leading-relaxed">
                {event.feedback || event.survey_response || 'No feedback provided'}
              </p>
            </div>
          )}
        </div>

        {/* Right Side: AI Decision */}
        {type !== 'discount' && (
          <div className={`lg:w-64 shrink-0 rounded-lg px-4 py-3 border ${type === 'pending' ? 'bg-emerald-500/5 border-emerald-500/10' : 'bg-zinc-800/30 border-zinc-700/20'}`}>
            <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest mb-1.5 ${type === 'pending' ? 'text-emerald-500' : 'text-zinc-500'}`}>
              {type === 'pending' ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
              AI Decision
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              {event.ai_score_reason || 'Automatically skipped.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
