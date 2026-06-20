import { notFound } from 'next/navigation';
import prisma from '@/lib/server/prisma';
import { IndianRupee, CheckCircle, Store, Mail, Phone, Calendar } from 'lucide-react';
import { planLabel } from '@/lib/planGates';
import PrintButton from './PrintButton';

// Force dynamic so it always fetches fresh data and doesn't cache at build time
export const dynamic = 'force-dynamic';

export default async function ReceiptPage({ params }: { params: Promise<{ txnid: string }> }) {
  const { txnid } = await params;
  
  const tx = await prisma.paymentTransaction.findFirst({
    where: { txnid, status: 'success' },
    include: {
      shop: true
    }
  });

  if (!tx) {
    return notFound();
  }

  // Fetch the owner manually since Prisma relation might not exist in schema for ownerId -> User
  const owner = tx.shop?.ownerId ? await prisma.user.findUnique({ where: { uuid: tx.shop.ownerId } }) : null;

  let payuData: any = null;
  try {
    if (tx.payuResponse) payuData = JSON.parse(tx.payuResponse);
  } catch (e) {}

  return (
    <div id="print-area" className="min-h-screen bg-slate-100 flex justify-center p-4 sm:p-8 text-slate-900 font-sans print:bg-white print:p-0">
      <div className="bg-white max-w-2xl w-full shadow-2xl rounded-2xl overflow-hidden print:shadow-none print:w-full print:max-w-none print:overflow-visible">
        
        {/* Header Section */}
        <div className="bg-slate-900 p-8 text-white flex justify-between items-start print:bg-white print:text-black print:border-b print:border-slate-300">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center">
                <Store size={20} className="text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight">Vyapar Sarthi</h1>
                <p className="text-indigo-400 text-sm font-medium print:text-slate-500">Complete Business Manager</p>
              </div>
            </div>
          </div>
          <div className="text-right">
            <h2 className="text-3xl font-black text-slate-100 print:text-black">RECEIPT</h2>
            <p className="text-slate-400 mt-1 font-mono text-sm print:text-slate-500">{tx.txnid}</p>
          </div>
        </div>

        {/* Action Button (Hidden when printing) */}
        <div className="px-8 pt-6 pb-2 flex justify-end print:hidden">
          <PrintButton />
        </div>

        <div className="p-8 pt-4">
          
          <div className="flex flex-col md:flex-row justify-between items-start gap-8 border-b border-slate-200 pb-8 mb-8">
            <div className="space-y-2">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Billed To</p>
              <h3 className="text-xl font-bold">{tx.shop?.name || owner?.storeName || 'Customer'}</h3>
              {owner && (
                <div className="text-sm text-slate-600 space-y-1">
                  <p className="flex items-center gap-2"><Phone size={14} className="text-slate-400" /> {owner.mobile || 'N/A'}</p>
                  <p className="flex items-center gap-2"><Mail size={14} className="text-slate-400" /> {owner.email}</p>
                </div>
              )}
            </div>
            <div className="space-y-4 min-w-[200px]">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Date Paid</p>
                <p className="font-semibold text-slate-700 flex items-center gap-2">
                  <Calendar size={14} className="text-indigo-500" />
                  {new Date(tx.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Payment Method</p>
                <p className="font-semibold text-slate-700">PayU ({tx.mode || 'Online'})</p>
                {tx.mihpayid && <p className="text-sm text-slate-500 mt-1">PayU ID: {tx.mihpayid}</p>}
                {payuData?.bank_ref_num && <p className="text-sm text-slate-500">Bank Ref: {payuData.bank_ref_num}</p>}
              </div>
            </div>
          </div>

          <div className="mb-8">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b-2 border-slate-200">
                  <th className="py-3 font-bold text-slate-500 uppercase tracking-wider text-sm">Description</th>
                  <th className="py-3 font-bold text-slate-500 uppercase tracking-wider text-sm text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                <tr>
                  <td className="py-5">
                    <p className="font-bold text-slate-900 text-lg">Subscription - {planLabel(tx.plan || 'shop')} Plan</p>
                    <p className="text-slate-500 text-sm mt-1">1 Month Access</p>
                  </td>
                  <td className="py-5 text-right font-bold text-xl text-slate-900">
                    ₹{tx.amount.toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex justify-end border-t-2 border-slate-200 pt-6">
            <div className="w-full max-w-sm">
              <div className="flex justify-between items-center text-xl font-black">
                <span className="text-slate-900">Total Paid</span>
                <span className="text-emerald-600 flex items-center">
                  <IndianRupee size={20} />{tx.amount.toFixed(2)}
                </span>
              </div>
              <div className="mt-4 flex justify-end">
                <div className="flex items-center gap-2 bg-emerald-50 text-emerald-600 px-4 py-2 rounded-xl text-sm font-bold w-fit">
                  <CheckCircle size={16} /> Payment Successful
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-slate-50 p-6 text-center text-sm text-slate-500 border-t border-slate-200 print:bg-white print:border-none">
          <p>Thank you for choosing Vyapar Sarthi.</p>
          <p className="text-xs mt-1 text-slate-400">This is a computer generated receipt and does not require a physical signature.</p>
        </div>

      </div>
    </div>
  );
}
