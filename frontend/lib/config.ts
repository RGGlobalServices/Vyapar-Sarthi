'use client';

const isDev = process.env.NODE_ENV === 'development';

export const LANDING_URL = process.env.NEXT_PUBLIC_LANDING_URL || (isDev ? 'http://localhost:3001' : '');
export const PAYMENT_URL = `${LANDING_URL}/payment`;
export const SUPPORT_URL = `${LANDING_URL}/support`;
