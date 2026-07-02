'use client';

import { useState, useEffect } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Gift, Copy, Check, Users, Share2, Award, Clock, ExternalLink } from 'lucide-react';
import api from '@/lib/api';
import { cn } from '@/lib/utils';

export default function ReferralPage() {
  const t = useTranslations('Referral');
  const locale = useLocale();
  const [referralCode, setReferralCode] = useState('');
  const [referralLink, setReferralLink] = useState('');
  const [team, setTeam] = useState<any[]>([]);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, successful: 0 });

  useEffect(() => {
    loadReferralData();
  }, []);

  async function loadReferralData() {
    try {
      const [codeRes, teamRes] = await Promise.all([
        api.get('/referrals/my-code'),
        api.get('/referrals/my-team'),
      ]);
      setReferralCode(codeRes.data.code);
      setReferralLink(`${window.location.origin}/${locale}/signup?ref=${codeRes.data.code}`);
      setStats({
        total: codeRes.data.total_referrals,
        successful: codeRes.data.successful_referrals,
      });
      setTeam(teamRes.data.team);
    } catch (err) {
      console.error('Failed to load referral data', err);
    } finally {
      setLoading(false);
    }
  }

  function copyReferralLink() {
    navigator.clipboard.writeText(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function shareOnWhatsApp() {
    const msg =
`🎯 Use my referral code: ${referralCode}

✅ You get 20% OFF on Vyapar Sarthi
✅ I get 1 month free

👉 Sign up here:
${referralLink}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{t('title') || 'Referral Program'}</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{t('desc') || 'Refer friends and earn free months!'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-purple-500/20 to-purple-600/5 border-purple-500/30 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-purple-500/20">
                <Gift className="w-6 h-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.total}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">{t('totalReferrals') || 'Total Referrals'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-500/20 to-emerald-600/5 border-emerald-500/30 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-emerald-500/20">
                <Award className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.successful}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">{t('successful') || 'Successful'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-sky-500/20 to-sky-600/5 border-sky-500/30 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-sky-500/20">
                <Clock className="w-6 h-6 text-sky-600 dark:text-sky-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{stats.successful}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">{t('freeMonths') || 'Free Months Earned'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500/20 to-amber-600/5 border-amber-500/30 shadow-sm">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-amber-500/20">
                <Share2 className="w-6 h-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{t('discount') || '20% OFF'}</p>
                <p className="text-sm text-slate-600 dark:text-slate-400">{t('discountDesc') || 'For Referred Friends'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
        <CardHeader>
          <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2">
            <Share2 className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
            {t('shareCode') || 'Share Your Referral Code'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-6 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 text-center">
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">{t('yourCode') || 'Your Referral Code'}</p>
            <p className="text-4xl font-black tracking-widest text-emerald-500 dark:text-emerald-400 select-all">
              {referralCode}
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={copyReferralLink}
              className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-emerald-500 text-white dark:text-slate-900 font-bold rounded-xl hover:bg-emerald-400 transition-all"
            >
              {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
              {copied ? 'Copied!' : (t('copyLink') || 'Copy Referral Link')}
            </button>
            <button
              onClick={shareOnWhatsApp}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white dark:text-slate-900 font-bold rounded-xl hover:bg-green-500 transition-all"
            >
              <ExternalLink className="w-5 h-5" />
              {t('shareWA') || 'Share on WhatsApp'}
            </button>
          </div>

          <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
            <p className="text-sm text-purple-800 dark:text-purple-300">
              <strong>🎁 {t('howItWorks') || 'How it works:'}</strong> {t('howItWorksDesc') || 'When someone uses your code and buys a paid plan, you get 1 month free extension on your current subscription! Your friend gets 20% off too.'}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-sm">
        <CardHeader>
          <CardTitle className="text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-emerald-500 dark:text-emerald-400" />
            {t('team') || 'Your Referral Team'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {team.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>{t('noReferrals') || "You haven't referred anyone yet. Share your code and start building your team!"}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="text-left p-3 text-slate-500 dark:text-slate-400 text-sm font-medium">Name</th>
                    <th className="text-left p-3 text-slate-500 dark:text-slate-400 text-sm font-medium">Package</th>
                    <th className="text-left p-3 text-slate-500 dark:text-slate-400 text-sm font-medium">Status</th>
                    <th className="text-left p-3 text-slate-500 dark:text-slate-400 text-sm font-medium">Expiry</th>
                    <th className="text-left p-3 text-slate-500 dark:text-slate-400 text-sm font-medium">Rewarded</th>
                  </tr>
                </thead>
                <tbody>
                  {team.map((member: any) => (
                    <tr key={member.id} className="border-b border-slate-200 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="p-3">
                        <div>
                          <p className="text-slate-900 dark:text-white font-medium">{member.referred_name}</p>
                          <p className="text-xs text-slate-500">{member.referred_email}</p>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className={cn(
                          "px-2 py-1 rounded text-xs font-bold",
                          member.package === 'wholesale' ? 'bg-purple-500/20 text-purple-600 dark:text-purple-300' :
                          member.package === 'shop' ? 'bg-sky-500/20 text-sky-600 dark:text-sky-300' :
                          'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'
                        )}>
                          {member.package}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={cn(
                          "px-2 py-1 rounded text-xs font-bold",
                          member.subscription_status === 'active' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300' :
                          member.subscription_status === 'trialing' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300' :
                          'bg-red-500/20 text-red-600 dark:text-red-300'
                        )}>
                          {member.subscription_status}
                        </span>
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-300 text-sm">
                        {member.subscription_expiry
                          ? new Date(member.subscription_expiry).toLocaleDateString()
                          : 'N/A'}
                      </td>
                      <td className="p-3">
                        {member.rewarded
                          ? <span className="text-emerald-500 dark:text-emerald-400 text-sm font-bold">✅ 1 Month</span>
                          : <span className="text-slate-500 text-sm">Pending</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
