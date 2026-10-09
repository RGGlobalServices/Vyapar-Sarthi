'use client';

import { forwardRef } from 'react';
import { fmtPaise, MILL_CHARGE_ORDER, type MillInvoiceData, type MillChargeName } from '@/lib/millInvoice';
import { amountInWords } from '@/lib/amountInWords';
import { placeOfSupplyText, stateFromGstin } from '@/lib/indiaStates';
import { useBillLocale } from '@/lib/billLanguage';
import { getMillBillLabels } from '@/lib/millBillLabels';

const num = (p: number) => fmtPaise(p).replace('₹', '');

export type InvoiceCopy = 'Original Copy' | 'Duplicate Copy' | 'Triplicate Copy';

/**
 * Professional A4 layout of a Bada Udyog (mill) invoice — navy header, meta bar, Bill To / Ship To,
 * items table, GST summary, bank details, terms and signatures. Title is "TAX INVOICE" when GST is
 * billed, "BILL OF SUPPLY" otherwise. Fixed black-on-white colours so print and PDF look the same.
 */
const MillInvoiceClassic = forwardRef<HTMLDivElement, { data: MillInvoiceData; copyLabel?: InvoiceCopy }>(function MillInvoiceClassic({ data: d, copyLabel }, ref) {
  const locale = useBillLocale();
  const L = getMillBillLabels(locale);
  const copyLabel_ = copyLabel ?? L.originalCopy as InvoiceCopy;
  const title = d.gstBilled ? L.taxInvoice : L.billOfSupply;
  const chargeName = (k: MillChargeName): string => {
    if (k === 'freight') return L.freight;
    if (k === 'hamali') return L.hamali;
    if (k === 'loading') return L.loading;
    if (k === 'unloading') return L.unloading;
    return L.otherCharges;
  };
  const accent = d.shop.accentColor || '#1a2744';
  const shopState = stateFromGstin(d.shop.gst);
  const placeOfSupply = placeOfSupplyText(d.customer.state || stateFromGstin(d.customer.gst) || shopState);
  const shipTo = d.customer.shippingAddress || d.customer.address;
  const termsLines = (d.shop.footer || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const terms = termsLines.length ? termsLines : [
    'Goods once sold will not be taken back.',
    'Interest @ 18% p.a. will be charged if the payment is not made within the stipulated time.',
    `Subject to ${shopState ? `'${shopState}'` : 'local'} jurisdiction only.`,
  ];
  const copyLabelText = copyLabel_ === 'Duplicate Copy' ? L.duplicateCopy : copyLabel_ === 'Triplicate Copy' ? L.triplicateCopy : L.originalCopy;
  const chargeRows = MILL_CHARGE_ORDER.filter((k) => d.charges[k] > 0);

  const summary = d.gstBilled
    ? d.taxRows.map((r) => ({ hsn: r.hsn, rate: `${r.rate}%`, taxable: r.taxablePaise, cgst: r.cgstPaise, sgst: r.sgstPaise, igst: r.igstPaise }))
    : Object.values(d.lines.reduce((acc: Record<string, { hsn: string; taxable: number }>, l) => {
        const k = l.hsn || '—'; (acc[k] ||= { hsn: l.hsn, taxable: 0 }).taxable += l.amountPaise; return acc;
      }, {})).map((g) => ({ hsn: g.hsn, rate: 'Exempt', taxable: g.taxable, cgst: 0, sgst: 0, igst: 0 }));

  const MetaCell = ({ label, value, testid }: { label: string; value: string; testid?: string }) => (
    <div className="flex flex-col min-w-0">
      <span className="text-[9.5px] font-semibold uppercase tracking-wide" style={{ color: '#888' }}>{label}</span>
      <span data-testid={testid} className="text-[11px] font-semibold text-[#111] truncate">{value || '—'}</span>
    </div>
  );

  return (
    <div ref={ref} data-testid="mill-invoice" data-print-format="a4" data-variant="a4" data-layout="classic"
      style={{ width: 800, backgroundColor: '#ffffff', color: '#111111' }} className="text-[12px] leading-snug font-sans text-left box-border">

      {/* ── HEADER ── */}
      <div style={{ backgroundColor: accent }} className="px-5 pt-4 pb-4 relative">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {d.shop.logoUrl && (
              <img src={d.shop.logoUrl} alt="" crossOrigin="anonymous"
                className="h-10 mb-2 object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
            )}
            <div className="text-[22px] font-extrabold uppercase tracking-wide text-white leading-tight">
              {d.shop.name || 'Business'}
            </div>
            {d.shop.address && (
              <div className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.78)' }}>
                {d.shop.address}
              </div>
            )}
            <div className="text-[10.5px] mt-1 flex flex-wrap gap-x-4" style={{ color: 'rgba(255,255,255,0.78)' }}>
              {d.shop.mobile && <span>Tel: {d.shop.mobile}</span>}
              {d.shop.email && <span>{d.shop.email}</span>}
            </div>
            <div className="text-[10.5px] mt-1 flex flex-wrap gap-x-4" style={{ color: 'rgba(255,255,255,0.72)' }}>
              {d.shop.gst && <span>GSTIN: <b className="text-white">{d.shop.gst}</b></span>}
              {d.shop.pan && <span>PAN: <b className="text-white">{d.shop.pan}</b></span>}
              {d.shop.fssai && <span>FSSAI: <b className="text-white">{d.shop.fssai}</b></span>}
            </div>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <span className="text-[10px] italic" style={{ color: 'rgba(255,255,255,0.7)' }}>{copyLabelText}</span>
            <div className="px-4 py-1.5 rounded font-bold text-[13px] tracking-wider"
              style={{ backgroundColor: 'rgba(255,255,255,0.18)', color: '#fff', border: '1.5px solid rgba(255,255,255,0.4)' }}>
              {title}
            </div>
          </div>
        </div>
      </div>

      {/* ── INVOICE META BAR ── */}
      <div className="grid grid-cols-5 gap-3 px-5 py-2.5 border-b border-[#ddd]" style={{ backgroundColor: '#f7f8fa' }}>
        <MetaCell label={L.invoiceNo} value={d.invoiceNumber} testid="mi-invoice-number" />
        <MetaCell label={L.dated} value={d.dateText} testid="mi-date" />
        <MetaCell label={L.placeOfSupply} value={placeOfSupply} />
        <MetaCell label={L.reverseCharge} value={d.dispatch.reverseCharge || 'N'} />
        <MetaCell label={L.salesmanName} value={d.dispatch.salesman} />
      </div>

      {/* ── DISPATCH META BAR ── */}
      {(d.dispatch.grRrNo || d.dispatch.transport || d.dispatch.vehicleNo || d.dispatch.station || d.dispatch.eWayBill) && (
        <div className="grid grid-cols-5 gap-3 px-5 py-2 border-b border-[#ddd]" style={{ backgroundColor: '#fff' }}>
          <MetaCell label={L.grRrNo} value={d.dispatch.grRrNo} />
          <MetaCell label={L.transport} value={d.dispatch.transport} />
          <MetaCell label={L.vehicleNo} value={d.dispatch.vehicleNo} />
          <MetaCell label={L.station} value={d.dispatch.station} />
          <MetaCell label={L.eWayBillNo} value={d.dispatch.eWayBill} />
        </div>
      )}

      {/* ── BILL TO / SHIP TO ── */}
      <div className="grid grid-cols-2 border-b border-[#ddd]">
        <div className="px-4 py-3 border-r border-[#ddd]">
          <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: accent }}>{L.billedTo}</div>
          <div data-testid="mi-customer" className="font-bold uppercase text-[12.5px]">{d.customer.name || 'Walk-in Customer'}</div>
          {d.customer.address && <div className="uppercase text-[11px] mt-0.5" style={{ color: '#555' }}>{d.customer.address}</div>}
          {d.customer.mobile && <div className="text-[11px] mt-0.5" style={{ color: '#555' }}>Ph: {d.customer.mobile}</div>}
          {d.customer.gst && <div className="text-[11px] mt-1 font-mono">GSTIN: {d.customer.gst}</div>}
          {d.customer.fssai && <div className="text-[11px]">FSSAI: {d.customer.fssai}</div>}
        </div>
        <div className="px-4 py-3">
          <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: accent }}>{L.shippedTo}</div>
          <div className="font-bold uppercase text-[12.5px]">{d.customer.name || 'Walk-in Customer'}</div>
          {shipTo && <div className="uppercase text-[11px] mt-0.5" style={{ color: '#555' }}>{shipTo}</div>}
          {d.customer.gst && <div className="text-[11px] mt-1 font-mono">GSTIN: {d.customer.gst}</div>}
        </div>
      </div>

      {/* ── BROKER BAR ── */}
      {(d.brokerName || d.dispatch.broker) && (
        <div className="px-4 py-1.5 border-b border-[#ddd] text-[11px]" style={{ backgroundColor: '#f7f8fa' }}>
          <span className="font-bold uppercase" style={{ color: accent }}>Broker:</span>{' '}
          <span className="uppercase">{d.brokerName || d.dispatch.broker}</span>
        </div>
      )}

      {/* ── ITEMS TABLE ── */}
      <table className="w-full border-collapse" data-testid="mi-items">
        <thead>
          <tr className="text-left text-[11px]" style={{ backgroundColor: accent, color: '#fff' }}>
            <th className="py-2 px-2 w-8 font-semibold">{L.sn}</th>
            <th className="py-2 px-2 font-semibold">{L.descriptionOfGoods}</th>
            <th className="py-2 px-2 w-[84px] font-semibold">{L.hsnSacCode}</th>
            <th className="py-2 px-2 w-[78px] text-right font-semibold">{L.qty}</th>
            <th className="py-2 px-2 w-[48px] font-semibold">{L.unit}</th>
            <th className="py-2 px-2 w-[90px] text-right font-semibold">{L.price}</th>
            <th className="py-2 px-2 w-[100px] text-right font-semibold">{L.amount}</th>
          </tr>
        </thead>
        <tbody>
          {d.lines.map((l, i) => (
            <tr key={i} className="align-top border-b border-[#eee]" data-testid="mi-line"
              style={{ backgroundColor: i % 2 === 0 ? '#fff' : '#fafbfc' }}>
              <td className="py-1.5 px-2 text-center text-[11px]">{i + 1}.</td>
              <td className="py-1.5 px-2 uppercase">
                {l.name}
                {l.batch && <div className="italic normal-case text-[10.5px]" style={{ color: '#777' }}>{L.batch}: {l.batch}</div>}
              </td>
              <td className="py-1.5 px-2 text-[11px] font-mono">{l.hsn}</td>
              <td className="py-1.5 px-2 text-right font-mono">
                {l.qty.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
              </td>
              <td className="py-1.5 px-2 uppercase text-[11px]">{l.unit}</td>
              <td className="py-1.5 px-2 text-right font-mono whitespace-nowrap">{num(l.ratePaise)}</td>
              <td className="py-1.5 px-2 text-right font-mono whitespace-nowrap font-semibold">{num(l.amountPaise)}</td>
            </tr>
          ))}
          {/* blank filler rows so the goods block keeps its height */}
          <tr aria-hidden="true">
            <td className="h-[100px]" colSpan={7} />
          </tr>
        </tbody>
      </table>

      {/* ── TOTALS + QTY TOTAL ── */}
      <div className="border-t-2 border-[#ddd]">
        <div className="flex">
          {/* qty total cell */}
          <div className="flex-1 flex items-center px-4 py-2 text-[11px]" style={{ color: '#555' }}>
            <span className="font-semibold mr-1">{L.qty}:</span>
            <span data-testid="mi-qty-total" className="font-mono">
              {d.qtyTotal.qty.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} {d.qtyTotal.unit.toUpperCase()}
            </span>
          </div>
          {/* amount summary */}
          <div className="w-[300px] px-3 py-2 space-y-0.5 border-l border-[#ddd]">
            <SummaryLine label={L.goodsSubtotal} value={num(d.goodsPaise)} testid="mi-goods" />
            {d.discountPaise > 0 && <SummaryLine label={L.lessDiscount} value={`− ${num(d.discountPaise)}`} testid="mi-discount" accent />}
            {d.gstBilled && <SummaryLine label={L.taxableAmount} value={num(d.taxablePaise)} testid="mi-taxable" />}
            {d.gstBilled && (d.interState
              ? <SummaryLine label={L.addIgst} value={num(d.igstPaise)} testid="mi-igst" />
              : (<>
                  <SummaryLine label={L.addCgst} value={num(d.cgstPaise)} testid="mi-cgst" />
                  <SummaryLine label={L.addSgst} value={num(d.sgstPaise)} testid="mi-sgst" />
                </>)
            )}
            {chargeRows.length > 0 && (
              <div data-testid="mi-charges">
                {chargeRows.map((k) => (
                  <SummaryLine key={k} label={`${locale === 'en' ? 'Add' : '+'}: ${chargeName(k)}`} value={num(d.charges[k])} testid={`mi-${k}`} />
                ))}
              </div>
            )}
            {d.roundOffPaise !== 0 && (
              <SummaryLine label={`${L.roundOff} (${d.roundOffPaise < 0 ? '−' : '+'})`} value={num(Math.abs(d.roundOffPaise))} testid="mi-roundoff" />
            )}
          </div>
        </div>
        {/* grand total bar */}
        <div className="flex border-t-2 border-[#ddd]" style={{ backgroundColor: accent }}>
          <div className="flex-1 text-right font-bold text-[13px] px-4 py-2 text-white">{L.grandTotal}</div>
          <div className="w-[300px] text-right font-extrabold text-[14px] px-3 py-2 text-white border-l border-white/20"
            data-testid="mi-grand">₹{num(d.grandPaise)}</div>
        </div>
      </div>

      {/* ── TAX SUMMARY ── */}
      <div className="border-t border-[#ddd] px-4 py-2" style={{ backgroundColor: '#f7f8fa' }}>
        <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: accent }}>
          {d.gstBilled ? 'GST Summary' : 'HSN Summary'}
        </div>
        <table className="border-collapse text-[10.5px] w-full" data-testid="mi-tax-table">
          <thead>
            <tr className="text-left border-b border-[#ddd]" style={{ color: '#555' }}>
              <th className="pr-3 pb-1 font-semibold">HSN/SAC</th>
              <th className="pr-3 pb-1 font-semibold">{L.taxRate}</th>
              <th className="pr-3 pb-1 font-semibold text-right">{L.taxableAmt}</th>
              <th className="pr-3 pb-1 font-semibold text-right">{d.interState ? L.igstAmt : L.cgstAmt}</th>
              {!d.interState && <th className="pr-3 pb-1 font-semibold text-right">{L.sgstAmt}</th>}
              <th className="pb-1 font-semibold text-right">{L.totalTax}</th>
            </tr>
          </thead>
          <tbody>
            {summary.map((r, i) => (
              <tr key={i}>
                <td className="pr-3 py-0.5 font-mono">{r.hsn || '—'}</td>
                <td className="pr-3">{r.rate}</td>
                <td className="pr-3 text-right font-mono">{num(r.taxable)}</td>
                <td className="pr-3 text-right font-mono">{d.gstBilled ? num(d.interState ? r.igst : r.cgst) : '--'}</td>
                {!d.interState && <td className="pr-3 text-right font-mono">{d.gstBilled ? num(r.sgst) : '--'}</td>}
                <td className="text-right font-mono font-semibold">{num(r.cgst + r.sgst + r.igst)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── AMOUNT IN WORDS ── */}
      <div className="border-t border-[#ddd] px-4 py-2 text-[11.5px]" data-testid="mi-words">
        <span className="font-semibold" style={{ color: accent }}>Amount in Words: </span>
        <span className="font-semibold">{amountInWords(d.grandPaise)}</span>
      </div>

      {/* ── PAYMENT STATUS ── */}
      {d.balancePaise > 0 && (
        <div className="border-t border-[#ddd] px-4 py-1.5 text-[11px] flex justify-between items-center" style={{ backgroundColor: '#fffbf2' }}>
          <span>{L.payment}: <b data-testid="mi-payment-mode">{d.paymentMode}</b></span>
          <span>
            {L.received} <b data-testid="mi-received">{num(d.paidPaise)}</b>
            {' · '}{L.balanceDue} <b data-testid="mi-balance" style={{ color: '#c0392b' }}>{num(d.balancePaise)}</b>
          </span>
        </div>
      )}

      {/* ── DECLARATION ── */}
      <div className="border-t border-[#ddd] px-4 py-1.5 text-center">
        <div className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: accent }}>{L.declaration}</div>
        <div className="text-[10.5px] leading-tight" style={{ color: '#555' }}>{L.declarationText}</div>
      </div>

      {/* ── FOOTER: bank + terms + signatures ── */}
      <div className="border-t border-[#ddd] grid grid-cols-2">
        {/* left: bank details + terms */}
        <div className="px-4 py-3 border-r border-[#ddd]">
          {(d.shop.bankAccountNumber || d.shop.upiId) && (
            <div className="mb-3">
              <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: accent }}>{L.bankDetails}</div>
              {d.shop.bankName && <div className="text-[11px]">{d.shop.bankName}</div>}
              {d.shop.bankAccountName && <div className="text-[11px]">A/C Name: {d.shop.bankAccountName}</div>}
              {d.shop.bankAccountNumber && <div className="text-[11px] font-mono">A/C: {d.shop.bankAccountNumber}</div>}
              {d.shop.bankIfsc && <div className="text-[11px] font-mono">IFSC: {d.shop.bankIfsc}</div>}
              {d.shop.upiId && <div className="text-[11px]">UPI: {d.shop.upiId}</div>}
            </div>
          )}
          <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: accent }}>{L.termsAndConditions}</div>
          <div className="text-[10px]" style={{ color: '#555' }}>{L.eAndOE}</div>
          {terms.map((t, i) => <div key={i} className="text-[10px]" style={{ color: '#555' }}>{i + 1}. {t}</div>)}
        </div>
        {/* right: receiver's signature + authorised signatory */}
        <div className="flex flex-col">
          <div className="px-4 py-3 border-b border-[#ddd] flex-1">
            <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: accent }}>{L.receiversSignature}</div>
            <div className="h-12" />
          </div>
          <div className="px-4 py-3 text-right">
            <div className="text-[11px] mb-1">For <b className="uppercase">{d.shop.name}</b></div>
            {d.shop.signatureUrl && (
              <img src={d.shop.signatureUrl} alt="" crossOrigin="anonymous" className="h-9 ml-auto object-contain mb-1" />
            )}
            <div className="text-[10.5px] font-semibold" style={{ color: accent }}>{L.authorisedSignatory}</div>
          </div>
        </div>
      </div>

      {!d.consistent && (
        <div data-testid="mi-inconsistent"
          className="mt-3 border-2 border-red-600 text-red-700 font-bold p-2 text-[11px]">
          WARNING: the stored bill figures are inconsistent ({d.problems.join('; ')}). Do not use this printout; contact support.
        </div>
      )}
    </div>
  );
});

function SummaryLine({ label, value, testid, accent }: { label: string; value: string; testid: string; accent?: boolean }) {
  return (
    <div className="flex justify-between gap-3 text-[11px]">
      <span style={accent ? { color: '#c0392b' } : {}}>{label}</span>
      <span data-testid={testid} className="whitespace-nowrap font-mono">{value}</span>
    </div>
  );
}

export default MillInvoiceClassic;
