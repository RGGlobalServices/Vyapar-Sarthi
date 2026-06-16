import crypto from 'crypto';
import { config } from './config';
import { ApiError } from './http';

export function isTestMode(): boolean {
  return !config.payuKey || !config.payuSalt;
}

export function getPayuConfig(): { key: string; salt: string } {
  if (!config.payuKey || !config.payuSalt) {
    throw new ApiError(503, 'Payment gateway not configured');
  }
  return { key: config.payuKey, salt: config.payuSalt };
}

export function requestHash(
  key: string,
  txnid: string,
  amount: string,
  productinfo: string,
  firstname: string,
  email: string,
  salt: string,
  udf1 = '',
  udf2 = '',
  udf3 = '',
  udf4 = '',
  udf5 = '',
  si = '',
): string {
  const hashString = si
    ? `${key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}||||||${si}|${salt}`
    : `${key}|${txnid}|${amount}|${productinfo}|${firstname}|${email}|${udf1}|${udf2}|${udf3}|${udf4}|${udf5}||||||${salt}`;
  return crypto.createHash('sha512').update(hashString).digest('hex');
}

export function responseHash(
  key: string,
  salt: string,
  status: string,
  txnid: string,
  amount: string,
  productinfo: string,
  firstname: string,
  email: string,
  udf1 = '',
  udf2 = '',
  udf3 = '',
  udf4 = '',
  udf5 = '',
): string {
  const hashString = `${salt}|${status}||||||${udf5}|${udf4}|${udf3}|${udf2}|${udf1}|${email}|${firstname}|${productinfo}|${amount}|${txnid}|${key}`;
  return crypto.createHash('sha512').update(hashString).digest('hex');
}

function refundHash(key: string, command: string, mihpayid: string, amount: string, salt: string): string {
  const hashString = `${key}|${command}|${mihpayid}|${amount}|${salt}`;
  return crypto.createHash('sha512').update(hashString).digest('hex');
}

export async function initiateRefund(mihpayid: string, amount: number | string) {
  const { key, salt } = getPayuConfig();
  const command = 'cancel_refund_transaction';
  const hash = refundHash(key, command, mihpayid, amount.toString(), salt);

  const params = new URLSearchParams({
    key,
    command,
    hash,
    var1: mihpayid,
    var2: amount.toString(),
    var3: 'all',
    var4: '',
  });

  const response = await fetch(config.payuRefundUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  return response.json();
}
