'use client';

import { forwardRef } from 'react';
import { fmtPaise, MILL_CHARGE_ORDER, type MillInvoiceData, type MillChargeName } from '@/lib/millInvoice';
import { amountInWords } from '@/lib/amountInWords';
import { placeOfSupplyText, stateFromGstin } from '@/lib/indiaStates';

const CHARGE_LABEL: Record<MillChargeName, string> = { freight: 'Freight', hamali: 'Hamali', loading: 'Loading', unloading: 'Unloading', other: 'Other Charges' };

const DEFAULT_DECLARATION = 'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.';

/** "86,920.00" without the ₹ sign: the classic bill prints the amount column plain and puts the rupee mark in the heading. */
const num = (p: number) => fmtPaise(p).replace('₹', '');

export type InvoiceCopy = 'Original Copy' | 'Duplicate Copy' | 'Triplicate Copy';

/**
 * The A4 layout of a Bada Udyog (mill) invoice — the classic Indian trade bill: seller block, invoice + dispatch details, Billed to /
 * Shipped to, goods table with HSN, tax summary, amount in words, declaration, bank details, terms and signatures. Title is "TAX INVOICE"
 * when GST is billed, "BILL OF SUPPLY" otherwise. It only RENDERS the stored figures of `data` (lib/millInvoice.ts) — it never calculates a
 * total — and keeps the test ids of the original mill invoice. Fixed black-on-white colours so screen, print and PDF look the same.
 */
const MillInvoiceClassic = forwardRef<HTMLDivElement, { data: MillInvoiceData; copyLabel?: InvoiceCopy }>(function MillInvoiceClassic({ data: d, copyLabel = 'Original Copy' }, ref) {
  const title = d.gstBilled ? 'TAX INVOICE' : 'BILL OF SUPPLY';
  const cell = 'border-black';
  const shopState = stateFromGstin(d.shop.gst);
  const placeOfSupply = placeOfSupplyText(d.customer.state || stateFromGstin(d.customer.gst) || shopState);
  const shipTo = d.customer.shippingAddress || d.customer.address;
  const termsLines = (d.shop.footer || '').split('\n').map((l) => l.trim()).filter(Boolean);
  const terms = termsLines.length ? termsLines : [
    'Goods once sold will not be taken back.',
    'Interest @ 18% p.a. will be charged if the payment is not made within the stipulated time.',
    `Subject to ${shopState ? `'${shopState}'` : 'local'} jurisdiction only.`,
  ];
  const meta = (label: string, value: string, testid?: string) => (
    <div className="flex gap-1"><span className="w-[92px] shrink-0">{label}</span><span>:</span><b data-testid={testid} className="font-medium">{value}</b></div>
  );

  // Tax summary: the stored GST groups for a tax invoice; for a bill of supply the goods grouped by HSN ("Exempt").
  const summary = d.gstBilled
    ? d.taxRows.map((r) => ({ hsn: r.hsn, rate: `${r.rate}%`, taxable: r.taxablePaise, cgst: r.cgstPaise, sgst: r.sgstPaise, igst: r.igstPaise }))
    : Object.values(d.lines.reduce((acc: Record<string, { hsn: string; taxable: number }>, l) => {
        const k = l.hsn || '—'; (acc[k] ||= { hsn: l.hsn, taxable: 0 }).taxable += l.amountPaise; return acc;
      }, {})).map((g) => ({ hsn: g.hsn, rate: 'Exempt', taxable: g.taxable, cgst: 0, sgst: 0, igst: 0 }));
  const chargeRows = MILL_CHARGE_ORDER.filter((k) => d.charges[k] > 0);
  const totalTax = d.totalGstPaise;

  return (
    <div ref={ref} data-testid="mill-invoice" data-print-format="a4" data-variant="a4" data-layout="classic"
      style={{ width: 800, backgroundColor: '#ffffff', color: '#111111' }} className="text-[12px] leading-snug font-sans text-left p-4 box-border">
      <div className="border border-black">
        {/* seller */}
        <div className="relative text-center px-3 pt-1 pb-2 border-b border-black">
          <div className="flex justify-between text-[12px]">
            <span>{d.shop.gst ? <>GSTIN : <b>{d.shop.gst}</b></> : ''}</span>
            <span className="italic">{copyLabel}</span>
          </div>
          {d.shop.logoUrl && <img src={d.shop.logoUrl} alt="" crossOrigin="anonymous" className="h-10 mx-auto object-contain" />}
          <div className="text-[13px] font-bold underline underline-offset-2">{title}</div>
          <div className="text-[22px] font-bold uppercase tracking-wide leading-tight">{d.shop.name || 'Business'}</div>
          {d.shop.address && <div className="uppercase">{d.shop.address}</div>}
          {d.shop.pan && <div>PAN : {d.shop.pan}</div>}
          <div className="italic">{[d.shop.mobile && `Tel. : ${d.shop.mobile}`, d.shop.email && `email : ${d.shop.email}`].filter(Boolean).join('   ')}</div>
        </div>

        {/* invoice + dispatch details */}
        <div className="grid grid-cols-2 border-b border-black">
          <div className={`px-2 py-1 border-r ${cell}`}>
            {meta('Invoice No.', d.invoiceNumber, 'mi-invoice-number')}
            {meta('Dated', d.dateText, 'mi-date')}
            {meta('Place of Supply', placeOfSupply)}
            {meta('Reverse Charge', d.dispatch.reverseCharge || 'N')}
            {meta('Salesman Name', d.dispatch.salesman)}
          </div>
          <div className="px-2 py-1">
            {meta('GR/RR No.', d.dispatch.grRrNo)}
            {meta('Transport', d.dispatch.transport)}
            {meta('Vehicle No.', d.dispatch.vehicleNo)}
            {meta('Station', d.dispatch.station)}
            {meta('E-Way Bill No.', d.dispatch.eWayBill)}
          </div>
        </div>

        {/* billed to / shipped to */}
        <div className="grid grid-cols-2 border-b border-black">
          <div className={`px-2 py-1 border-r ${cell} min-h-[104px] flex flex-col justify-between`}>
            <div>
              <div className="italic font-semibold">Billed to :</div>
              <div data-testid="mi-customer" className="uppercase">{d.customer.name || 'Walk-in Customer'}</div>
              {d.customer.address && <div className="uppercase">{d.customer.address}</div>}
              {d.customer.mobile && <div>Ph: {d.customer.mobile}</div>}
            </div>
            <div>GSTIN / UIN &nbsp;&nbsp;&nbsp;&nbsp;: {d.customer.gst}</div>
          </div>
          <div className="px-2 py-1 min-h-[104px] flex flex-col justify-between">
            <div>
              <div className="italic font-semibold">Shipped to :</div>
              <div className="uppercase">{d.customer.name || 'Walk-in Customer'}</div>
              {shipTo && <div className="uppercase">{shipTo}</div>}
            </div>
            <div>GSTIN / UIN &nbsp;&nbsp;&nbsp;&nbsp;: {d.customer.gst}</div>
          </div>
        </div>

        {d.brokerName && <div className="px-2 py-1 border-b border-black uppercase">BROKER:-{d.brokerName}</div>}

        {/* goods */}
        <table className="w-full border-collapse" data-testid="mi-items">
          <thead>
            <tr className="border-b border-black text-left">
              <th className="py-1 px-1 w-8 border-r border-black font-semibold">S.N.</th>
              <th className="py-1 px-1 border-r border-black font-semibold">Description of Goods</th>
              <th className="py-1 px-1 w-[84px] border-r border-black font-semibold">HSN/ SAC Code</th>
              <th className="py-1 px-1 w-[78px] border-r border-black text-right font-semibold">Qty.</th>
              <th className="py-1 px-1 w-[48px] border-r border-black font-semibold">Unit</th>
              <th className="py-1 px-1 w-[84px] border-r border-black text-right font-semibold">Price</th>
              <th className="py-1 px-1 w-[104px] text-right font-semibold">Amount(₹)</th>
            </tr>
          </thead>
          <tbody>
            {d.lines.map((l, i) => (
              <tr key={i} className="align-top" data-testid="mi-line">
                <td className="py-1 px-1 border-r border-black text-center">{i + 1}.</td>
                <td className="py-1 px-1 border-r border-black uppercase">{l.name}{l.batch ? <div className="italic normal-case text-[11px]">Batch: {l.batch}</div> : null}</td>
                <td className="py-1 px-1 border-r border-black">{l.hsn}</td>
                <td className="py-1 px-1 border-r border-black text-right">{l.qty.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</td>
                <td className="py-1 px-1 border-r border-black uppercase">{l.unit}</td>
                <td className="py-1 px-1 border-r border-black text-right whitespace-nowrap">{num(l.ratePaise)}</td>
                <td className="py-1 px-1 text-right whitespace-nowrap">{num(l.amountPaise)}</td>
              </tr>
            ))}
            {/* blank space so the goods block keeps its height like a printed bill */}
            <tr aria-hidden="true">
              <td className="border-r border-black h-[120px]" /><td className="border-r border-black" /><td className="border-r border-black" /><td className="border-r border-black" /><td className="border-r border-black" /><td className="border-r border-black" /><td />
            </tr>
          </tbody>
        </table>

        {/* amount block */}
        <div className="border-t border-black">
          <div className="flex justify-end"><div className="w-[300px] px-2 py-1 space-y-0.5">
            <Line label="Goods Subtotal" value={num(d.goodsPaise)} testid="mi-goods" />
            {d.discountPaise > 0 && <Line label="Less : Discount" value={`${num(d.discountPaise)}`} testid="mi-discount" />}
            {d.gstBilled && <Line label="Taxable Amount" value={num(d.taxablePaise)} testid="mi-taxable" />}
            {d.gstBilled && (d.interState
              ? <Line label="Add : IGST" value={num(d.igstPaise)} testid="mi-igst" />
              : (<><Line label="Add : CGST" value={num(d.cgstPaise)} testid="mi-cgst" /><Line label="Add : SGST" value={num(d.sgstPaise)} testid="mi-sgst" /></>))}
            {chargeRows.length > 0 && <div data-testid="mi-charges">{chargeRows.map((k) => <Line key={k} label={`Add : ${CHARGE_LABEL[k]}`} value={num(d.charges[k])} testid={`mi-${k}`} />)}</div>}
            {d.roundOffPaise !== 0 && <Line label={`Less : Rounded Off (${d.roundOffPaise < 0 ? '-' : '+'})`} value={num(Math.abs(d.roundOffPaise))} testid="mi-roundoff" />}
          </div></div>
          <div className="flex border-t border-black">
            <div className="flex-1 text-right font-semibold px-2 py-1">Grand Total</div>
            <div className="w-[160px] text-center py-1 border-l border-black font-semibold" data-testid="mi-qty-total">
              {d.qtyTotal.qty.toLocaleString('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })} {d.qtyTotal.unit.toUpperCase()}
            </div>
            <div className="w-[104px] text-right font-bold px-1 py-1 border-l border-black" data-testid="mi-grand">₹{num(d.grandPaise)}</div>
          </div>
        </div>

        {/* tax summary */}
        <div className="border-t border-black px-2 py-1">
          <table className="border-collapse text-[11px]" data-testid="mi-tax-table">
            <thead>
              <tr className="text-left">
                <th className="pr-3 font-semibold underline">HSN/ SAC</th><th className="pr-3 font-semibold underline">Tax Rate</th><th className="pr-3 font-semibold underline text-right">Taxable Amt.</th>
                <th className="pr-3 font-semibold underline text-right">{d.interState ? 'IGST Amt.' : 'CGST Amt.'}</th>
                <th className="pr-3 font-semibold underline text-right">{d.interState ? '' : 'SGST Amt.'}</th>
                <th className="font-semibold underline text-right">Total Tax</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((r, i) => (
                <tr key={i}>
                  <td className="pr-3">{r.hsn || '—'}</td><td className="pr-3">{r.rate}</td><td className="pr-3 text-right">{num(r.taxable)}</td>
                  <td className="pr-3 text-right">{d.gstBilled ? num(d.interState ? r.igst : r.cgst) : '--'}</td>
                  <td className="pr-3 text-right">{d.gstBilled && !d.interState ? num(r.sgst) : d.gstBilled ? '' : '--'}</td>
                  <td className="text-right">{num(r.cgst + r.sgst + r.igst)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {totalTax === 0 && !d.gstBilled && <span className="sr-only">No GST billed</span>}
        </div>

        <div className="border-t border-black px-2 py-1.5 font-semibold" data-testid="mi-words">{amountInWords(d.grandPaise)}</div>

        {d.balancePaise > 0 && (
          <div className="border-t border-black px-2 py-1 text-[11px] flex justify-between">
            <span>Payment: <b data-testid="mi-payment-mode">{d.paymentMode}</b></span>
            <span>Received <b data-testid="mi-received">{num(d.paidPaise)}</b> · Balance due <b data-testid="mi-balance">{num(d.balancePaise)}</b></span>
          </div>
        )}

        <div className="border-t border-black px-3 py-1 text-center">
          <div className="font-semibold underline">Declaration</div>
          <div className="text-[10.5px] leading-tight">{DEFAULT_DECLARATION}</div>
        </div>

        {(d.shop.bankAccountNumber || d.shop.upiId) && (
          <div className="border-t border-black px-2 py-1">
            <div>
              Bank Details : &nbsp;{[d.shop.bankName, d.shop.bankAccountNumber && `A/C NO. ${d.shop.bankAccountNumber}`].filter(Boolean).join(' ')}
              {d.shop.bankIfsc && <div className="pl-[84px]">IFSC CODE :- {d.shop.bankIfsc}</div>}
              {d.shop.upiId && <div className="pl-[84px]">UPI : {d.shop.upiId}</div>}
            </div>
          </div>
        )}

        {/* terms + signatures */}
        <div className="grid grid-cols-[1fr_1fr] border-t border-black">
          <div className={`px-2 py-1 border-r ${cell} text-[10.5px]`}>
            <div className="underline">Terms &amp; Conditions</div>
            <div>E.&amp; O.E.</div>
            {terms.map((t, i) => <div key={i}>{i + 1}. {t}</div>)}
          </div>
          <div className="flex flex-col">
            <div className="px-2 py-1 border-b border-black min-h-[48px] text-[10.5px]">Receiver&apos;s Signature :</div>
            <div className="flex-1 px-2 py-1 text-right text-[12px] flex flex-col justify-between min-h-[64px]">
              <div>For <b className="uppercase">{d.shop.name}</b></div>
              <div>
                {d.shop.signatureUrl && <img src={d.shop.signatureUrl} alt="" crossOrigin="anonymous" className="h-8 ml-auto object-contain" />}
                Authorised Signatory
              </div>
            </div>
          </div>
        </div>
      </div>

      {!d.consistent && (
        <div data-testid="mi-inconsistent" className="mt-3 border-2 border-red-600 text-red-700 font-bold p-2 text-[11px]">
          WARNING: the stored bill figures are inconsistent ({d.problems.join('; ')}). Do not use this printout; contact support.
        </div>
      )}
    </div>
  );
});

function Line({ label, value, testid }: { label: string; value: string; testid: string }) {
  return <div className="flex justify-between gap-3"><span>{label}</span><span data-testid={testid} className="whitespace-nowrap">{value}</span></div>;
}

export default MillInvoiceClassic;
