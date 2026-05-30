const isDev = process.env.NODE_ENV === 'development';

export const config = {
  API_BASE: process.env.NEXT_PUBLIC_API_URL || (isDev ? 'http://localhost:10000/api/v1' : ''),
  FRONTEND_URL: process.env.NEXT_PUBLIC_FRONTEND_URL || (isDev ? 'http://localhost:3000' : ''),
  LANDING_URL: process.env.NEXT_PUBLIC_LANDING_URL || (isDev ? 'http://localhost:3001' : ''),
  GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || '',
};
