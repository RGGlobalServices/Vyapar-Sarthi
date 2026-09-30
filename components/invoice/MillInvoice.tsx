'use client';

import { forwardRef } from 'react';
import { fmtPaise, MILL_CHARGE_ORDER, type MillInvoiceData, type MillChargeName } from '@/lib/millInvoice';

const CHARGE_LABEL: Record<MillChargeName, string> = {
  freight: 'Freight', hamali: 'Hamali', loading: 'Loading', unloading: 'Unloading', other: 'Other Charges',
};

/**
 * Dedicated invoice for `pricing_model = "mill_v2"` (GST-exclusive rates). Renders ONLY the stored figures in `data`
 * (see lib/millInvoice.ts) — it never calculates a total, and it is never used for legacy invoices (those keep BillSlip /
 * A4Invoice / ThermalInvoice untouched). Commercial charges are shown in their own block, never as item lines.
 * Colours are fixed (white paper / black ink) so screen, print and PDF capture look identical in any app theme.
 */
const MillInvoice = forwardRef<HTMLDivElement, { data: MillInvoiceData; variant: 'a4' | 'thermal' }>(function MillInvoice({ data: d, variant }, ref) {
  const a4 = variant === 'a4';
  const fs = a4 ? 'text-[13px]' : 'text-[11px]';
  const hasCharges = d.chargesTotalPaise > 0;
  const Row = ({ label, value, strong, sub, testid }: { label: string; value: string; strong?: boolean; sub?: boolean; testid: string }) => (
    <div className={`flex justify-between gap-3 ${strong ? 'font-bold' : ''} ${sub ? 'pl-3 text-[0.92em]' : ''}`}>
      <span>{label}</span><span data-testid={testid} className="font-mono whitespace-nowrap">{value}</span>
    </div>
  );

  const accent = d.shop.accentColor || null;
  const headerStyle = accent ? { backgroundColor: accent, color: '#ffffff', borderColor: accent } : {};
  const headerBorder = accent ? 'border-b-0' : 'border-b border-black';

  return (
    <div
      ref={ref}
      data-testid="mill-invoice"
      data-print-format={a4 ? 'a4' : 'thermal80'}
      data-variant={variant}
      style={{ width: a4 ? 800 : 320, backgroundColor: '#ffffff', color: '#111111' }}
      className={`${fs} leading-snug font-sans ${a4 ? 'p-8' : 'p-3'} box-border`}
    >
      {/* Business header */}
      <div
        className={`text-center pb-2 ${a4 ? 'mb-3' : 'mb-2'} ${headerBorder} ${accent ? 'rounded px-3 py-2' : ''}`}
        style={headerStyle}
      >
        {d.shop.logoUrl && a4 && (
          <img src={d.shop.logoUrl} alt="" crossOrigin="anonymous" className="h-12 mx-auto mb-1 object-contain" />
        )}
        <div className={`${a4 ? 'text-2xl' : 'text-base'} font-black uppercase tracking-wide`}>{d.shop.name || 'Business'}</div>
        {d.shop.address && <div>{d.shop.address}</div>}
        <div>{[d.shop.mobile && `Ph: ${d.shop.mobile}`, d.shop.email].filter(Boolean).join('  |  ')}</div>
        <div>{[d.shop.gst && `GSTIN: ${d.shop.gst}`, d.shop.pan && `PAN: ${d.shop.pan}`].filter(Boolean).join('  |  ')}</div>
      </div>
      {accent && <div className="border-b border-black mb-3" />}

      <div className={`text-center font-black ${a4 ? 'text-lg mb-2' : 'text-sm mb-1'}`}>{d.gstBilled ? 'TAX INVOICE' : 'INVOICE'}</div>

      {/* Meta + customer */}
      <div className={`${a4 ? 'grid grid-cols-2 gap-6 mb-3' : 'mb-2 space-y-1'}`}>
        <div>
          <div>Invoice No: <b data-testid="mi-invoice-number">{d.invoiceNumber}</b></div>
          <div>Date: <b data-testid="mi-date">{d.dateText}</b></div>
          <div>Payment Mode: <b data-testid="mi-payment-mode">{d.paymentMode}</b></div>
        </div>
        <div>
          <div className="font-bold">Bill To</div>
          <div data-testid="mi-customer">{d.customer.name || 'Walk-in Customer'}</div>
          {d.customer.mobile && <div>Ph: {d.customer.mobile}</div>}
          {d.customer.address && <div>{d.customer.address}</div>}
          {d.customer.gst && <div>GSTIN: {d.customer.gst}</div>}
        </div>
      </div>

      {/* Goods */}
      <table className="w-full border-collapse" data-testid="mi-items">
        <thead>
          <tr className="border-y border-black text-left">
            <th className="py-1 pr-1 w-6">#</th>
            <th className="py-1 pr-1">Product</th>
            {a4 && <th className="py-1 pr-1">Batch</th>}
            <th className="py-1 pr-1">Unit</th>
            <th className="py-1 pr-1 text-right">Qty</th>
            <th className="py-1 pr-1 text-right">Rate (Excl. GST)</th>
            <th className="py-1 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {d.lines.map((l, i) => (
            <tr key={i} className="border-b border-gray-300 align-top" data-testid="mi-line">
              <td className="py-1 pr-1">{i + 1}</td>
              <td className="py-1 pr-1">{l.name}{!a4 && l.batch ? <div className="text-[0.85em]">Batch: {l.batch}</div> : null}</td>
              {a4 && <td className="py-1 pr-1">{l.batch || '—'}</td>}
              <td className="py-1 pr-1">{l.unit}</td>
              <td className="py-1 pr-1 text-right font-mono">{l.qty}</td>
              <td className="py-1 pr-1 text-right font-mono whitespace-nowrap">{fmtPaise(l.ratePaise)}</td>
              <td className="py-1 text-right font-mono whitespace-nowrap">{fmtPaise(l.amountPaise)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className={`mt-1 font-semibold ${a4 ? 'text-[12px]' : 'text-[10px]'}`} data-testid="mi-ex-gst-note">Rate is exclusive of GST.</div>

      {/* Totals */}
      <div className={`${a4 ? 'ml-auto w-[55%]' : 'w-full'} mt-2 space-y-0.5`}>
        <Row label="Goods Subtotal" value={fmtPaise(d.goodsPaise)} testid="mi-goods" />
        {d.discountPaise > 0 && <Row label="Discount" value={`- ${fmtPaise(d.discountPaise)}`} testid="mi-discount" />}
        <Row label="Taxable Amount" value={fmtPaise(d.taxablePaise)} testid="mi-taxable" />
        {d.gstBilled ? (
          d.interState ? (
            <Row label="IGST" value={fmtPaise(d.igstPaise)} testid="mi-igst" sub />
          ) : (
            <>
              <Row label="CGST" value={fmtPaise(d.cgstPaise)} testid="mi-cgst" sub />
              <Row label="SGST" value={fmtPaise(d.sgstPaise)} testid="mi-sgst" sub />
            </>
          )
        ) : null}
        {d.gstBilled && <Row label="Total GST" value={fmtPaise(d.totalGstPaise)} testid="mi-gst" />}

        {hasCharges && (
          <div className="border-t border-dashed border-gray-500 mt-1 pt-1" data-testid="mi-charges">
            <div className="font-semibold text-[0.9em]">Commercial Charges (not goods)</div>
            {MILL_CHARGE_ORDER.filter((k) => d.charges[k] > 0).map((k) => (
              <Row key={k} label={CHARGE_LABEL[k]} value={fmtPaise(d.charges[k])} testid={`mi-${k}`} sub />
            ))}
          </div>
        )}

        {d.roundOffPaise !== 0 && <Row label="Round Off" value={`${d.roundOffPaise > 0 ? '+' : '-'} ${fmtPaise(Math.abs(d.roundOffPaise))}`} testid="mi-roundoff" />}
        <div className="border-t-2 border-black mt-1 pt-1">
          <Row label="Grand Total" value={fmtPaise(d.grandPaise)} testid="mi-grand" strong />
        </div>
        <Row label="Amount Received" value={fmtPaise(d.paidPaise)} testid="mi-received" />
        <Row label="Balance / Udhar" value={fmtPaise(d.balancePaise)} testid="mi-balance" strong={d.balancePaise > 0} />
      </div>

      {/* GST summary */}
      {d.gstBilled && d.taxRows.length > 0 && (
        <table className={`w-full border-collapse mt-3 ${a4 ? 'text-[12px]' : 'text-[9.5px]'}`} data-testid="mi-tax-table">
          <thead>
            <tr className="border-y border-black text-left">
              <th className="py-0.5">HSN</th><th className="py-0.5 text-right">GST %</th><th className="py-0.5 text-right">Taxable</th>
              {d.interState ? <th className="py-0.5 text-right">IGST</th> : (<><th className="py-0.5 text-right">CGST</th><th className="py-0.5 text-right">SGST</th></>)}
            </tr>
          </thead>
          <tbody>
            {d.taxRows.map((r, i) => (
              <tr key={i} className="border-b border-gray-300">
                <td className="py-0.5">{r.hsn || '—'}</td>
                <td className="py-0.5 text-right font-mono">{r.rate}%</td>
                <td className="py-0.5 text-right font-mono">{fmtPaise(r.taxablePaise)}</td>
                {d.interState ? <td className="py-0.5 text-right font-mono">{fmtPaise(r.igstPaise)}</td> : (<><td className="py-0.5 text-right font-mono">{fmtPaise(r.cgstPaise)}</td><td className="py-0.5 text-right font-mono">{fmtPaise(r.sgstPaise)}</td></>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {(d.shop.upiId || d.shop.bankAccountNumber) && a4 && (
        <div className="mt-3 text-[12px]">
          <div className="font-bold">Payment Details</div>
          {d.shop.upiId && <div>UPI: {d.shop.upiId}</div>}
          {d.shop.bankAccountNumber && <div>{[d.shop.bankName, d.shop.bankAccountName, `A/c ${d.shop.bankAccountNumber}`, d.shop.bankIfsc && `IFSC ${d.shop.bankIfsc}`].filter(Boolean).join(' · ')}</div>}
        </div>
      )}

      {!d.consistent && (
        <div data-testid="mi-inconsistent" className="mt-3 border-2 border-red-600 text-red-700 font-bold p-2 text-[11px]">
          WARNING: the stored bill figures are inconsistent ({d.problems.join('; ')}). Do not use this printout; contact support.
        </div>
      )}

      <div className={`${a4 ? 'mt-6' : 'mt-3'} flex justify-between items-end`}>
        <div className="text-[0.9em]">{d.shop.footer || 'Thank you for your business!'}</div>
        {a4 && (
          <div className="text-center text-[12px]">
            {d.shop.signatureUrl ? <img src={d.shop.signatureUrl} alt="" crossOrigin="anonymous" className="h-10 mx-auto" /> : <div className="h-10" />}
            <div className="border-t border-black px-6">Authorised Signatory</div>
          </div>
        )}
      </div>
    </div>
  );
});

export default MillInvoice;
