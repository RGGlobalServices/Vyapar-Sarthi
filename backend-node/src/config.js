import dotenv from 'dotenv';
dotenv.config({ path: '../.env.local' });
dotenv.config();

export const config = {
  port: process.env.PORT || 10000,
  databaseUrl: process.env.DATABASE_URL || '',
  jwtSecret: process.env.SECRET_KEY || 'your-secret-key-for-dev-only',
  jwtAlgorithm: 'HS256',
  jwtExpiresIn: '7d',

  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  landingUrl: process.env.LANDING_URL || 'http://localhost:3001',
  backendUrl: process.env.BACKEND_URL || 'http://localhost:10000',
  appUrl: process.env.APP_URL || 'http://localhost:3000',

  corsOrigins: [
    process.env.FRONTEND_URL,
    process.env.LANDING_URL,
    process.env.BACKEND_URL,
    process.env.APP_URL,
    'http://localhost:3000',
    'http://localhost:3001',
  ].filter(Boolean),

  // PayU
  payuKey: process.env.PAYU_KEY || '',
  payuSalt: process.env.PAYU_SALT || '',
  payuUrl: 'https://secure.payu.in/_payment',
  payuTestUrl: 'https://test.payu.in/_payment',
  payuRefundUrl: 'https://info.payu.in/merchant/postservice?form=2',

  // Plan amounts (INR)
  planAmounts: { basic: 599, professional: 999, business: 1499 },
  planLabels: {
    basic: 'Vyapar Sarthi Small Store Plan',
    professional: 'Vyapar Sarthi Big Store Plan',
    business: 'Vyapar Sarthi Wholesale Plan',
  },
  trialInitAmount: 2,
  trialDays: 14,

  // Email / SMTP
  smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
  smtpPort: parseInt(process.env.SMTP_PORT || '587'),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASSWORD || '',
  supportEmail: process.env.SUPPORT_EMAIL || 'gbroindustries@gmail.com',

  // Admin
  adminSecretKey: process.env.ADMIN_SECRET_KEY || 'vyapar-sarthi-admin-secret-2025',
  adminEmail: process.env.ADMIN_EMAIL || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  adminName: process.env.ADMIN_NAME || 'Admin',
};
