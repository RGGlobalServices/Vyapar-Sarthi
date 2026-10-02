import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMoney, cleanMobile, cleanVehicleNumber, cleanGstin, normalizeMillBill, fillFreight, freightMismatch, mergeMillBills, reconcileBillLine, westernDigits, EMPTY_MILL_BILL } from '../../lib/millBill.ts';

test('Devanagari digits become normal digits', () => {
  assert.equal(westernDigits('२७०००'), '27000');
  assert.equal(parseMoney('२,७०००/-'), 27000);
});

test('money: rupee signs, commas, trailing "/-" and "=00"', () => {
  assert.equal(parseMoney('₹ 4,12,050/-'), 412050);
  assert.equal(parseMoney('412050=00'), 412050);
  assert.equal(parseMoney(7000), 7000);
  assert.equal(parseMoney('abc'), null);
  assert.equal(parseMoney(''), null);
});

test('mobile: only a clean 10-digit number is kept', () => {
  assert.equal(cleanMobile('98265 14988'), '9826514988');
  assert.equal(cleanMobile('+91-9826514988'), '9826514988');
  assert.equal(cleanMobile('09826514988'), '9826514988');
  assert.equal(cleanMobile('98265149'), '');
  assert.equal(cleanMobile(null), '');
});

test('vehicle number: tidy Indian registration', () => {
  assert.equal(cleanVehicleNumber('MH 40 CM 4784'), 'MH 40 CM 4784');
  assert.equal(cleanVehicleNumber('mh40cm4784'), 'MH 40 CM 4784');
  assert.equal(cleanVehicleNumber('MH-40-CM-4784'), 'MH 40 CM 4784');
  assert.equal(cleanVehicleNumber(''), '');
});

test('GSTIN must be valid shape, else empty (never a guess)', () => {
  assert.equal(cleanGstin('27AMVPM9470J1ZT'), '27AMVPM9470J1ZT');
  assert.equal(cleanGstin('27AMVPM94'), '');
});

test('freight: balance / advance / total fill from the other two, never overwrite', () => {
  assert.equal(fillFreight({ freightTotal: 27000, freightAdvance: 20000, freightBalance: null }).freightBalance, 7000);
  assert.equal(fillFreight({ freightTotal: 27000, freightAdvance: null, freightBalance: 7000 }).freightAdvance, 20000);
  assert.equal(fillFreight({ freightTotal: null, freightAdvance: 20000, freightBalance: 7000 }).freightTotal, 27000);
  assert.equal(fillFreight({ freightTotal: 27000, freightAdvance: 20000, freightBalance: 5000 }).freightBalance, 5000);
  assert.equal(freightMismatch({ freightTotal: 27000, freightAdvance: 20000, freightBalance: 5000 }), true);
  assert.equal(freightMismatch({ freightTotal: 27000, freightAdvance: 20000, freightBalance: 7000 }), false);
});

test('the sample bill: normalise what the model read', () => {
  const b = normalizeMillBill({
    broker: ' आनंद तलेरा ', vehicleNumber: 'MH 40 CM 4784', driverName: 'प्रेम नारायण मिश्रा', driverMobile: '62687 76026',
    truckOwnerName: 'सूरज वैश्य', truckOwnerMobile: '98265 14988', freightTotal: '27000', freightAdvance: '20000', freightBalance: '', totalBags: '270',
    sellerBank: { bankName: 'State Bank of India', ifsc: 'sbn0013648', accountNo: '34628 345533' },
  });
  assert.equal(b.broker, 'आनंद तलेरा');
  assert.equal(b.driverMobile, '6268776026');
  assert.equal(b.freightBalance, 7000);
  assert.equal(b.totalBags, 270);
  assert.equal(b.sellerBank.ifsc, 'SBN0013648');
  assert.equal(b.sellerBank.accountNo, '34628345533');
});

test('garbage in -> empty out, nothing invented', () => {
  assert.deepEqual(normalizeMillBill(null), EMPTY_MILL_BILL);
  assert.deepEqual(normalizeMillBill('x'), EMPTY_MILL_BILL);
});

test('merge pages: first non-empty value wins', () => {
  const a = normalizeMillBill({ vehicleNumber: 'MH 40 CM 4784' });
  const b = normalizeMillBill({ vehicleNumber: 'XX 11 YY 1111', driverName: 'Ram' });
  const m = mergeMillBills([a, b]);
  assert.equal(m.vehicleNumber, 'MH 40 CM 4784');
  assert.equal(m.driverName, 'Ram');
});

test('quintal bill line: 123 q at 3350 = 4,12,050 -> 12,300 kg at Rs 33.50', () => {
  const r = reconcileBillLine({ printedWeight: '123.00', printedWeightUnit: 'quintal', printedRate: '3350', amount: '412050' });
  assert.deepEqual(r, { quantityKg: 12300, ratePerKg: 33.5, unit: 'quintal' });
});

test('a rate per kg bill stays per kg', () => {
  const r = reconcileBillLine({ printedWeight: 1000, printedWeightUnit: 'kg', printedRate: 54.75, amount: 54750 });
  assert.deepEqual(r, { quantityKg: 1000, ratePerKg: 54.75, unit: 'kg' });
});

test('if the printed figures do not reproduce the amount, leave the line alone', () => {
  assert.equal(reconcileBillLine({ printedWeight: 123, printedWeightUnit: 'quintal', printedRate: 3350, amount: 100000 }), null);
  assert.equal(reconcileBillLine({ printedWeight: 123, printedWeightUnit: 'bags', printedRate: 3350, amount: 412050 }), null);
});
