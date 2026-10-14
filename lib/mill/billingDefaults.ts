// Mill billing state defaults — canonical source of truth.
// WholesaleBillingUI imports constants from here so the mill component files
// can be dynamically imported without pulling their code into the base bundle.
// Component files re-export from here so call sites outside WholesaleBillingUI
// still get the right types.

import { stateFromGstin } from '@/lib/indiaStates';
import type { MillChargeKey } from '@/lib/millBilling';

export type MillChargeInputs = Record<MillChargeKey, string>;
export const EMPTY_MILL_CHARGES: MillChargeInputs = { freight: '', hamali: '', loading: '', unloading: '', other: '' };

export type BrokerValue = { name: string; commission: string };
export const EMPTY_BROKER: BrokerValue = { name: '', commission: '' };

export type BillPartyInput = { name: string; address: string; gst: string; state: string; shipping: string };
export const EMPTY_BILL_PARTY: BillPartyInput = { name: '', address: '', gst: '', state: '', shipping: '' };

export function billPartyFrom(p: any): BillPartyInput {
  if (!p) return EMPTY_BILL_PARTY;
  const docs = p.documents && typeof p.documents === 'object' ? p.documents : {};
  return {
    name: p.name || '',
    address: p.address || '',
    gst: p.gst || '',
    state: docs.state || stateFromGstin(p.gst) || '',
    shipping: docs.shippingAddress || '',
  };
}

export type DispatchInput = {
  transport: string;
  vehicleNo: string;
  station: string;
  eWayBill: string;
  grRrNo: string;
  salesman: string;
  reverseCharge: 'Y' | 'N';
};

export const EMPTY_DISPATCH_INPUT: DispatchInput = {
  transport: '', vehicleNo: '', station: '', eWayBill: '', grRrNo: '', salesman: '', reverseCharge: 'N',
};
