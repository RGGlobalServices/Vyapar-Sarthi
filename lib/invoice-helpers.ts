import { CartItem } from '@/lib/store';
import { BusinessType } from '@/lib/businessConfig';

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
      if (businessType === 'clothes') {
        cols.push({
          id: 'color',
          labelKey: 'color',
          align: 'center',
          render: (item) => item.color || '-'
        });
      }
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
      render: (item) => item.quantity
    },
    {
      id: 'rate',
      labelKey: 'rate',
      align: 'right',
      render: (item) => `₹${item.price.toLocaleString('en-IN')}`
    },
    {
      id: 'amt',
      labelKey: 'amt',
      align: 'right',
      width: 'w-16',
      render: (item) => `₹${item.total.toLocaleString('en-IN')}`
    }
  );

  return cols;
}
