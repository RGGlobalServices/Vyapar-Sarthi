'use client';

import { SUPPORT_URL } from '@/lib/config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HelpCircle, Mail, MessageCircle, ExternalLink } from 'lucide-react';

export default function SupportPage() {
  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        <HelpCircle className="text-emerald-500" size={28} />
        <h1 className="text-3xl font-black text-white tracking-tight">Help & Support</h1>
      </div>

      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-slate-200 flex items-center gap-2">
            <MessageCircle size={18} className="text-emerald-500" /> Contact Us
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-slate-300">
          <p>Need help with Vyapar Sarthi? We're here for you.</p>
          <div className="flex items-center gap-3 text-sm">
            <Mail size={16} className="text-slate-500" />
            <a href="mailto:support@vyaparsarthi.com" className="text-emerald-400 hover:underline">support@vyaparsarthi.com</a>
          </div>
          <a
            href={SUPPORT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 bg-emerald-500 text-slate-900 px-6 py-3 rounded-xl font-bold hover:bg-emerald-400 transition-all mt-2"
          >
            <ExternalLink size={18} /> Visit Support Portal
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
