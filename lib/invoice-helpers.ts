import { CartItem } from '@/lib/store';
import { BusinessType } from '@/lib/businessConfig';

// Wholesale billing appends Transport/Loading/Packing/Other charges into the
// same items array (so they persist with the sale for reprints), but they
// aren't goods — showing them as a product row with a "0% GST" column reads
// as a data error on a tax invoice. Both the live bill and reprints identify
// them by name (SaleItem has no dedicated "is this a charge" column), so the
// label strings here must stay in sync with CHARGE_LABELS in WholesaleBillingUI.
export const CHARGE_ITEM_NAMES = new Set([
  'Transport Charges',
  'Loading Charges',
  'Packing Charges',
  'Other Charges',
]);

export function isChargeLineItem(name: string | undefined | null): boolean {
  return !!name && CHARGE_ITEM_NAMES.has(name);
}

export interface InvoiceColumn {
  id: string;
  labelKey: string;
  align: 'left' | 'center' | 'right';
  width?: string;
  render: (item: CartItem) => React.ReactNode;
}

export function getInvoiceColumns(businessType: BusinessType | string): InvoiceColumn[] {
  // Base columns
  const cols: InvoiceColumn[] = [
    {
      id: 'item',
      labelKey: 'item',
      align: 'left',
      render: (item) => item.name
    }
  ];

  switch (businessType) {
    case 'medical':
      cols.push(
        {
          id: 'batch',
          labelKey: 'batch',
          align: 'left',
          render: (item) => item.batchNumber || '-'
        },
        {
          id: 'expiry',
          labelKey: 'expiry',
          align: 'left',
          render: (item) => item.expiryDate ? new Date(item.expiryDate).toLocaleDateString('en-GB', { month: '2-digit', year: '2-digit' }) : '-'
        }
      );
      break;
    case 'clothes':
    case 'shoes':
      // Both categories support colour × size variants (businessConfig.hasColors),
      // so both need the colour column — it isn't clothes-specific.
      cols.push({
        id: 'color',
        labelKey: 'color',
        align: 'center',
        render: (item) => item.color || '-'
      });
      cols.push({
        id: 'size',
        labelKey: 'size',
        align: 'center',
        render: (item) => item.size || '-'
      });
      break;
    case 'electric':
    case 'electronics':
      cols.push(
        {
          id: 'serial',
          labelKey: 'serial',
          align: 'left',
          render: (item) => item.serialNumber || '-'
        },
        {
          id: 'warranty',
          labelKey: 'warranty',
          align: 'center',
          render: (item) => item.warrantyDays ? `${item.warrantyDays}d` : '-'
        }
      );
      break;
  }

  // Common trailing columns
  cols.push(
    {
      id: 'qty',
      labelKey: 'qty',
      align: 'center',
      width: 'w-8',
      render: (item) => {
        const u = item.unit && item.unit !== 'Unit' ? ` ${item.unit}` : '';
        return `${item.quantity}${u}`;
      }
    },
    {
      id: 'rate',
      labelKey: 'rate',
      align: 'right',
      render: (item) => `₹${inr(item.price)}`
    },
    {
      id: 'amt',
      labelKey: 'amt',
      align: 'right',
      width: 'w-16',
      render: (item) => `₹${inr(item.total)}`
    }
  );

  return cols;
}

/**
 * Money for bills: whole rupees print without decimals (599), anything with paise prints TWO decimals (2,307.20) —
 * toLocaleString alone gives "2,307.2", which reads as a cut-off number on a receipt.
 */
export function inr(n: number | string | null | undefined): string {
  const v = Number(n) || 0;
  const hasPaise = Math.abs(v - Math.round(v)) > 0.004;
  return v.toLocaleString('en-IN', hasPaise ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 });
}
