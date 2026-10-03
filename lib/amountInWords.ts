const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function below1000(n: number): string {
  const parts: string[] = [];
  if (n >= 100) { parts.push(`${ONES[Math.floor(n / 100)]} Hundred`); n %= 100; }
  if (n >= 20) { parts.push(TENS[Math.floor(n / 10)] + (n % 10 ? ` ${ONES[n % 10]}` : '')); }
  else if (n > 0) parts.push(ONES[n]);
  return parts.join(' ');
}

/** Whole rupees in the Indian system: 99610 -> "Ninety Nine Thousand Six Hundred Ten"; 12,34,567 -> "Twelve Lakh Thirty Four Thousand …". */
function rupeesToWords(n: number): string {
  if (n === 0) return 'Zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(`${below1000(crore)} Crore`);
  if (lakh) parts.push(`${below1000(lakh)} Lakh`);
  if (thousand) parts.push(`${below1000(thousand)} Thousand`);
  if (n) parts.push(below1000(n));
  return parts.join(' ');
}

/** "Rupees Ninety Nine Thousand Six Hundred Ten Only" (paise as "and Fifty Paise" when there are any). Takes paise to stay exact. */
export function amountInWords(totalPaise: number): string {
  const p = Math.max(0, Math.round(Number(totalPaise) || 0));
  const rupees = Math.floor(p / 100);
  const paise = p % 100;
  return `Rupees ${rupeesToWords(rupees)}${paise ? ` and ${below1000(paise)} Paise` : ''} Only`;
}
