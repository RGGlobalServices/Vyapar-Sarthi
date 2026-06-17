'use client';

import { useState, useRef, useEffect } from 'react';
import { useLocale } from 'next-intl';
import { Sparkles, X, Send, Loader2, Bot, User, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import api from '@/lib/api';

interface Msg { role: 'user' | 'ai'; text: string }

const SUGGESTIONS = [
  'What is the price of …?',
  'Which products sell the most?',
  'Which items have low profit margin?',
  'What is low in stock right now?',
];

export default function AIFloatingButton() {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  async function ask(q: string) {
    const question = q.trim();
    if (!question || loading) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', text: question }]);
    setLoading(true);
    try {
      const res = await api.post('/ai/chat', { question, locale });
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

  return (
    <>
      {/* Floating trigger */}
      <button
        onClick={() => setOpen(true)}
        className={cn(
          'fixed bottom-6 right-6 z-40 w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-xl shadow-indigo-500/30 flex items-center justify-center text-white hover:scale-105 transition-transform',
          open && 'hidden'
        )}
        aria-label="AI Assistant"
      >
        <Sparkles size={24} />
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-6 right-6 z-50 w-[calc(100vw-3rem)] max-w-sm h-[560px] max-h-[80vh] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-slate-800 bg-gradient-to-r from-indigo-500/10 to-violet-500/10">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
                <Sparkles size={18} className="text-white" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Vyapar Guru</h3>
                <p className="text-[11px] text-slate-500">Your AI business advisor</p>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={getInsights} disabled={loading} title="Daily business report"
                className="flex items-center gap-1 text-[11px] font-semibold text-indigo-300 bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 rounded-lg px-2 py-1.5 disabled:opacity-50 transition-colors">
                <BarChart3 size={13} /> Insights
              </button>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-6">
                <div className="w-12 h-12 rounded-2xl bg-indigo-500/15 flex items-center justify-center mx-auto mb-3">
                  <Bot size={22} className="text-indigo-400" />
                </div>
                <p className="text-sm text-slate-300 font-medium">Namaste! I&apos;m Vyapar Guru.</p>
                <p className="text-xs text-slate-500 mt-1">Your AI business advisor — I know your products, prices &amp; sales.</p>
                <button onClick={getInsights}
                  className="w-full mt-4 flex items-center justify-center gap-2 text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-600 hover:opacity-90 rounded-xl px-3 py-2.5 shadow-lg shadow-indigo-500/20 transition-opacity">
                  <BarChart3 size={16} /> Get Today&apos;s Business Report
                </button>
                <p className="text-[10px] text-slate-600 mt-3 mb-1.5 uppercase tracking-wider font-semibold">Or ask me</p>
                <div className="flex flex-col gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button key={s} onClick={() => ask(s)}
                      className="text-left text-xs text-slate-300 bg-slate-800/50 hover:bg-slate-800 border border-slate-800 rounded-lg px-3 py-2 transition-colors">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={cn('flex gap-2.5', m.role === 'user' && 'flex-row-reverse')}>
                <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0',
                  m.role === 'ai' ? 'bg-indigo-500/15 text-indigo-400' : 'bg-slate-700 text-slate-300')}>
                  {m.role === 'ai' ? <Bot size={15} /> : <User size={15} />}
                </div>
                <div className={cn('max-w-[78%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap',
                  m.role === 'ai' ? 'bg-slate-800 text-slate-200 rounded-tl-sm' : 'bg-indigo-500 text-white rounded-tr-sm')}>
                  {m.text}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-indigo-500/15 text-indigo-400 flex items-center justify-center flex-shrink-0">
                  <Bot size={15} />
                </div>
                <div className="bg-slate-800 rounded-2xl rounded-tl-sm px-3.5 py-2.5 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce [animation-delay:-0.3s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce [animation-delay:-0.15s]" />
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-500 animate-bounce" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={(e) => { e.preventDefault(); ask(input); }}
            className="p-3 border-t border-slate-800 flex items-center gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about a product, price, stock…"
              className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 placeholder:text-slate-600"
            />
            <button type="submit" disabled={loading || !input.trim()}
              className="w-10 h-10 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 text-white flex items-center justify-center flex-shrink-0 transition-colors">
              {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </form>
        </div>
      )}
    </>
  );
}
