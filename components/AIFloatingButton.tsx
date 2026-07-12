'use client';

import { useState, useRef, useEffect } from 'react';
import { useLocale } from 'next-intl';
import {
  Sparkles, X, Send, Loader2, Bot, User, BarChart3,
  Zap, Search, ChevronRight, AlertTriangle, ShoppingCart, Users, TrendingDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';
import { useAIContext } from '@/lib/hooks/useAIContext';
import { useRouter } from '@/i18n/routing';

interface Msg { role: 'user' | 'ai'; text: string }

interface Suggestion {
  id: string;
  type: 'reorder' | 'collect_outstanding' | 'clear_dead_stock' | 'review_margin';
  priority: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  impact: string;
  actionLabel: string;
  actionPath?: string;
}

const PRIORITY_ICON: Record<string, any> = {
  reorder: ShoppingCart,
  collect_outstanding: Users,
  clear_dead_stock: TrendingDown,
  review_margin: AlertTriangle,
};

const PRIORITY_COLOR: Record<string, string> = {
  high: 'text-rose-400 bg-rose-500/10 border-rose-500/20',
  medium: 'text-amber-400 bg-amber-500/10 border-amber-500/20',
  low: 'text-slate-400 bg-slate-700/40 border-slate-700',
};

const SCREEN_SUGGESTIONS: Record<string, string[]> = {
  billing: ['Which products sell the most today?', 'What is the profit margin on my top products?', 'How can I increase my average bill value?'],
  stock: ['Which items are low in stock?', 'What are my slow moving products?', 'Which product will stock out first?'],
  udhar: ['Who has the highest outstanding?', 'Which customers haven\'t paid in 30 days?', 'What is my total outstanding amount?'],
  reports: ['How were my sales this month vs last month?', 'What is my net profit this week?', 'Which category is most profitable?'],
  customers: ['Who are my top customers?', 'Which customers are inactive?', 'Who is at credit risk?'],
  purchases: ['Which items should I reorder now?', 'What is my total purchase cost this month?'],
  expenses: ['What is my biggest expense category?', 'How can I reduce costs?'],
};

const DEFAULT_SUGGESTIONS = [
  'What is low in stock right now?',
  'Which products sell the most?',
  'Who has highest outstanding?',
  'How was business this week?',
];

type Panel = 'chat' | 'automation' | 'search';

export default function AIFloatingButton() {
  const locale = useLocale();
  const router = useRouter();
  const { screenContext, screenLabel } = useAIContext();

  const [open, setOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<Panel>('chat');

  // Chat state
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Automation state
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [automationLoading, setAutomationLoading] = useState(false);
  const [automationSummary, setAutomationSummary] = useState<any>(null);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const screenSuggestions = SCREEN_SUGGESTIONS[screenContext] || DEFAULT_SUGGESTIONS;

  async function ask(q: string) {
    const question = q.trim();
    if (!question || loading) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: question }]);
    setLoading(true);
    try {
      const res = await api.post('/ai/chat', { question, locale, screenContext });
      setMessages((m) => [...m, { role: 'ai', text: res.data.answer || 'No answer.' }]);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Sorry, something went wrong. Please try again.';
      setMessages((m) => [...m, { role: 'ai', text: msg }]);
    } finally {
      setLoading(false);
    }
  }

  async function getInsights() {
    if (loading) return;
    setMessages((m) => [...m, { role: 'user', text: '📊 Give me today\'s business report' }]);
    setLoading(true);
    try {
      const res = await api.post('/ai/insights', { locale });
      setMessages((m) => [...m, { role: 'ai', text: res.data.report || 'No report.' }]);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || 'Sorry, could not generate the report. Please try again.';
      setMessages((m) => [...m, { role: 'ai', text: msg }]);
    } finally {
      setLoading(false);
    }
  }

  async function loadAutomation() {
    if (automationLoading || suggestions.length > 0) return;
    setAutomationLoading(true);
    try {
      const res = await api.get('/ai/automation');
      setSuggestions(res.data.suggestions || []);
      setAutomationSummary(res.data.summary || null);
    } catch {
      setSuggestions([]);
    } finally {
      setAutomationLoading(false);
    }
  }

  async function handleSearch(e?: React.FormEvent) {
    e?.preventDefault();
    if (!searchQuery.trim() || searchLoading) return;
    setSearchLoading(true);
    setSearchResults(null);
    try {
      const res = await api.post('/ai/search', { query: searchQuery });
      setSearchResults(res.data);
    } catch {
      setSearchResults({ message: 'Search failed. Please try again.', results: [] });
    } finally {
      setSearchLoading(false);
    }
  }

  const handlePanelChange = (panel: Panel) => {
    setActivePanel(panel);
    if (panel === 'automation') loadAutomation();
  };

  const handleOpen = () => { setOpen(true); };
  const handleClose = () => { setOpen(false); };

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={handleOpen}
        className={cn(
          'fixed bottom-6 right-6 z-40 w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-xl shadow-indigo-500/30 flex items-center justify-center text-white hover:scale-105 transition-transform',
          open && 'hidden'
        )}
        aria-label="AI Assistant"
      >
        <Sparkles size={24} />
      </button>

      {/* Panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[calc(100vw-3rem)] max-w-sm h-[600px] max-h-[85vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-gradient-to-r from-indigo-500/10 to-violet-500/10 flex-shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                <Sparkles size={16} className="text-white" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Vyapar Guru</h3>
                <p className="text-[10px] text-indigo-300/70">{screenLabel}</p>
              </div>
            </div>
            <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-slate-800 flex-shrink-0">
            {([
              { id: 'chat', label: 'Chat', icon: Bot },
              { id: 'automation', label: 'Actions', icon: Zap },
              { id: 'search', label: 'Search', icon: Search },
            ] as { id: Panel; label: string; icon: any }[]).map(tab => {
              const Icon = tab.icon;
              return (
                <button key={tab.id} onClick={() => handlePanelChange(tab.id)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold transition-colors',
                    activePanel === tab.id
                      ? 'text-indigo-400 border-b-2 border-indigo-500 bg-indigo-500/5'
                      : 'text-slate-500 hover:text-slate-300'
                  )}>
                  <Icon size={13} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* ── CHAT PANEL ── */}
          {activePanel === 'chat' && (
            <>
              <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.length === 0 && (
                  <div className="text-center py-4">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-500/15 flex items-center justify-center mx-auto mb-3">
                      <Bot size={20} className="text-indigo-400" />
                    </div>
                    <p className="text-sm text-slate-300 font-semibold">Namaste! I&apos;m Vyapar Guru.</p>
                    <p className="text-xs text-slate-500 mt-1 mb-3">Answering questions about your {screenLabel}.</p>
                    <button onClick={getInsights}
                      className="w-full flex items-center justify-center gap-2 text-xs font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-600 hover:opacity-90 rounded-xl px-3 py-2.5 shadow-lg shadow-indigo-500/20 transition-opacity mb-3">
                      <BarChart3 size={14} /> Get Today&apos;s Business Report
                    </button>
                    <p className="text-[10px] text-slate-600 mb-2 uppercase tracking-wider font-semibold">Suggested for {screenLabel}</p>
                    <div className="flex flex-col gap-1.5">
                      {screenSuggestions.map((s) => (
                        <button key={s} onClick={() => ask(s)}
                          className="text-left text-xs text-slate-300 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 rounded-lg px-3 py-2 transition-colors">
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {messages.map((m, i) => (
                  <div key={i} className={cn('flex gap-2', m.role === 'user' && 'flex-row-reverse')}>
                    <div className={cn('w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0',
                      m.role === 'ai' ? 'bg-indigo-500/15 text-indigo-400' : 'bg-slate-700 text-slate-300')}>
                      {m.role === 'ai' ? <Bot size={13} /> : <User size={13} />}
                    </div>
                    <div className={cn('max-w-[80%] rounded-2xl px-3.5 py-2 text-xs whitespace-pre-wrap leading-relaxed',
                      m.role === 'ai' ? 'bg-slate-800 text-slate-200 rounded-tl-sm' : 'bg-indigo-500 text-white rounded-tr-sm')}>
                      {m.text}
                    </div>
                  </div>
                ))}

                {loading && (
                  <div className="flex gap-2">
                    <div className="w-6 h-6 rounded-lg bg-indigo-500/15 text-indigo-400 flex items-center justify-center flex-shrink-0">
                      <Bot size={13} />
                    </div>
                    <div className="bg-slate-800 rounded-2xl rounded-tl-sm px-3.5 py-2.5 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.3s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce [animation-delay:-0.15s]" />
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce" />
                    </div>
                  </div>
                )}
              </div>
              <form onSubmit={(e) => { e.preventDefault(); ask(input); }}
                className="p-3 border-t border-slate-800 flex items-center gap-2 flex-shrink-0">
                <input value={input} onChange={(e) => setInput(e.target.value)}
                  placeholder={`Ask about ${screenLabel}…`}
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 placeholder:text-slate-600" />
                <button type="submit" disabled={loading || !input.trim()}
                  className="w-9 h-9 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 text-white flex items-center justify-center flex-shrink-0 transition-colors">
                  {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                </button>
              </form>
            </>
          )}

          {/* ── AUTOMATION PANEL ── */}
          {activePanel === 'automation' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {automationLoading && (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <Loader2 size={28} className="animate-spin text-indigo-400" />
                  <p className="text-xs text-slate-500">Analyzing your business…</p>
                </div>
              )}
              {!automationLoading && automationSummary && (
                <div className="bg-slate-800/50 rounded-xl p-3 border border-slate-700/50">
                  <p className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mb-2">Summary</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-center">
                      <p className="text-lg font-black text-rose-400">{automationSummary.highPriority}</p>
                      <p className="text-[10px] text-slate-500">High Priority</p>
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-black text-emerald-400">₹{(automationSummary.totalPotentialRecovery || 0).toLocaleString('en-IN')}</p>
                      <p className="text-[10px] text-slate-500">Recoverable</p>
                    </div>
                  </div>
                </div>
              )}
              {!automationLoading && suggestions.length === 0 && !automationSummary && (
                <div className="text-center py-12">
                  <Zap size={32} className="text-slate-700 mx-auto mb-3" />
                  <p className="text-sm text-slate-500">No urgent actions found.</p>
                  <p className="text-xs text-slate-600 mt-1">Your business is running smoothly!</p>
                </div>
              )}
              {suggestions.map((s) => {
                const Icon = PRIORITY_ICON[s.type] || Zap;
                return (
                  <div key={s.id} className={cn('rounded-xl p-3 border', PRIORITY_COLOR[s.priority])}>
                    <div className="flex items-start gap-2.5">
                      <div className="w-7 h-7 rounded-lg bg-current/10 flex items-center justify-center flex-shrink-0">
                        <Icon size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-200 leading-tight">{s.title}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{s.description}</p>
                        <p className="text-[11px] text-emerald-400 mt-1 font-semibold">{s.impact}</p>
                        {s.actionPath && (
                          <button
                            onClick={() => { handleClose(); router.push(s.actionPath! as any); }}
                            className="mt-2 flex items-center gap-1 text-[11px] font-bold text-indigo-400 hover:text-indigo-300 transition-colors">
                            {s.actionLabel} <ChevronRight size={11} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── SEARCH PANEL ── */}
          {activePanel === 'search' && (
            <div className="flex-1 flex flex-col overflow-hidden">
              <form onSubmit={handleSearch} className="p-3 flex gap-2 flex-shrink-0 border-b border-slate-800">
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="low stock, who has outstanding…"
                  className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 placeholder:text-slate-600"
                  autoFocus
                />
                <button type="submit" disabled={searchLoading || !searchQuery.trim()}
                  className="w-9 h-9 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 text-white flex items-center justify-center transition-colors">
                  {searchLoading ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}
                </button>
              </form>

              {!searchResults && !searchLoading && (
                <div className="p-3 space-y-1.5">
                  <p className="text-[10px] text-slate-600 uppercase tracking-wider font-bold px-1 mb-2">Try asking</p>
                  {['Low stock products', 'Who has highest outstanding?', 'Show top selling items', 'Dead stock', 'Recent bills'].map(q => (
                    <button key={q} onClick={() => { setSearchQuery(q); }}
                      className="w-full text-left text-xs text-slate-400 bg-slate-800/40 hover:bg-slate-800 border border-slate-800 rounded-lg px-3 py-2 transition-colors">
                      {q}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {searchResults && (
                  <>
                    <p className="text-[11px] text-slate-400 font-semibold mb-2">{searchResults.message}</p>
                    {(searchResults.results || []).slice(0, 15).map((r: any, i: number) => (
                      <div key={i} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3">
                        {r.type === 'product' && (
                          <>
                            <p className="text-xs font-bold text-white">{r.name}</p>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                              {r.category && <span className="text-[10px] text-slate-500">{r.category}</span>}
                              {r.currentStock !== undefined && <span className="text-[10px] text-amber-400 font-bold">Stock: {r.currentStock}</span>}
                              {r.revenue && <span className="text-[10px] text-emerald-400">₹{r.revenue.toLocaleString('en-IN')}</span>}
                              {r.tiedCapital && <span className="text-[10px] text-rose-400">Tied: ₹{r.tiedCapital.toLocaleString('en-IN')}</span>}
                              {r.status && <span className="text-[10px] text-rose-400 font-bold">{r.status}</span>}
                            </div>
                          </>
                        )}
                        {r.type === 'customer' && (
                          <>
                            <p className="text-xs font-bold text-white">{r.name}</p>
                            <div className="flex gap-3 mt-1">
                              {r.mobile && <span className="text-[10px] text-slate-400">{r.mobile}</span>}
                              {r.outstanding && <span className="text-[10px] text-rose-400 font-bold">₹{r.outstanding.toLocaleString('en-IN')} due</span>}
                            </div>
                          </>
                        )}
                        {r.type === 'bill' && (
                          <>
                            <p className="text-xs font-bold text-white">{r.invoiceNumber}</p>
                            <div className="flex gap-3 mt-1">
                              <span className="text-[10px] text-emerald-400 font-bold">₹{(r.totalAmount || 0).toLocaleString('en-IN')}</span>
                              <span className="text-[10px] text-slate-400">{r.customerName}</span>
                              <span className="text-[10px] text-slate-500">{r.paymentType}</span>
                            </div>
                          </>
                        )}
                        {r.type === 'expense_category' && (
                          <>
                            <p className="text-xs font-bold text-white">{r.category}</p>
                            <div className="flex gap-3 mt-1">
                              <span className="text-[10px] text-rose-400 font-bold">₹{(r.amount || 0).toLocaleString('en-IN')}</span>
                              <span className="text-[10px] text-slate-400">{r.count} entries</span>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
