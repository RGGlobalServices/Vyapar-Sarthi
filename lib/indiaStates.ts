/** GST state codes: the first two digits of a GSTIN say which state it is registered in. */
export const GST_STATES: Array<{ code: string; name: string }> = [
  { code: '01', name: 'Jammu & Kashmir' }, { code: '02', name: 'Himachal Pradesh' }, { code: '03', name: 'Punjab' }, { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' }, { code: '06', name: 'Haryana' }, { code: '07', name: 'Delhi' }, { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' }, { code: '10', name: 'Bihar' }, { code: '11', name: 'Sikkim' }, { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' }, { code: '14', name: 'Manipur' }, { code: '15', name: 'Mizoram' }, { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' }, { code: '18', name: 'Assam' }, { code: '19', name: 'West Bengal' }, { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' }, { code: '22', name: 'Chhattisgarh' }, { code: '23', name: 'Madhya Pradesh' }, { code: '24', name: 'Gujarat' },
  { code: '26', name: 'Dadra & Nagar Haveli and Daman & Diu' }, { code: '27', name: 'Maharashtra' }, { code: '29', name: 'Karnataka' }, { code: '30', name: 'Goa' },
  { code: '31', name: 'Lakshadweep' }, { code: '32', name: 'Kerala' }, { code: '33', name: 'Tamil Nadu' }, { code: '34', name: 'Puducherry' },
  { code: '35', name: 'Andaman & Nicobar Islands' }, { code: '36', name: 'Telangana' }, { code: '37', name: 'Andhra Pradesh' }, { code: '38', name: 'Ladakh' },
];

/** "Maharashtra" for GSTIN 27AJUPA6210B1ZM (or '' when the GSTIN is missing / its first two digits are not a state). */
export function stateFromGstin(gstin: string | null | undefined): string {
  const code = String(gstin ?? '').trim().slice(0, 2);
  return GST_STATES.find((s) => s.code === code)?.name ?? '';
}

/** "Maharashtra (27)" — the way an invoice prints the place of supply. */
export function placeOfSupplyText(stateName: string | null | undefined): string {
  const n = String(stateName ?? '').trim();
  if (!n) return '';
  const hit = GST_STATES.find((s) => s.name.toLowerCase() === n.toLowerCase());
  return hit ? `${hit.name} (${hit.code})` : n;
}
