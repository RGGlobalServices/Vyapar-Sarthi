// Server-side configuration, ported from the former Express backend.
// Reads from process.env at runtime (server-only — never import in client code).
export const config = {
  jwtSecret: process.env.SECRET_KEY || (process.env.NODE_ENV === 'production' ? (() => { throw new Error('SECRET_KEY is missing in production'); })() : 'your-secret-key-for-dev-only'),
  jwtAlgorithm: 'HS256' as const,
  jwtExpiresIn: '7d',

  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  landingUrl: process.env.LANDING_URL || 'http://localhost:3001',
  appUrl: process.env.APP_URL || 'http://localhost:3000',

  // PayU
  payuKey: process.env.PAYU_KEY || '',
  payuSalt: process.env.PAYU_SALT || '',
  payuUrl: 'https://secure.payu.in/_payment',
  payuTestUrl: 'https://test.payu.in/_payment',
  payuRefundUrl: 'https://info.payu.in/merchant/postservice?form=2',

  // Plan amounts (INR)
  planAmounts: { shop: 299, vyapar: 499, wholesale: 999 } as Record<string, number>,
  planLabels: {
    shop: 'Dukaan Plan — ₹299/mo',
    vyapar: 'Vyapar Plan — ₹499/mo',
    wholesale: 'Udyog Plan — ₹999/mo',
  } as Record<string, string>,
  trialInitAmount: 1,        // ₹1 refundable mandate-authentication charge
  trialDays: 7,              // default trial (no referral)
  trialDaysReferral: 14,     // trial when a referral code was applied
  billingCycleDays: 30,      // recurring billing interval
  moneyBackDays: 30,         // money-back guarantee window from first real charge

  // Cron / scheduled jobs (protect the subscription processor endpoint)
  cronSecret: process.env.CRON_SECRET || 'change-me-cron-secret',

  // Email / SMTP
  smtpHost: process.env.SMTP_HOST || 'smtp.gmail.com',
  smtpPort: parseInt(process.env.SMTP_PORT || '587'),
  smtpUser: process.env.SMTP_USER || '',
  smtpPass: process.env.SMTP_PASSWORD || '',
  supportEmail: process.env.SUPPORT_EMAIL || 'gbroindustries@gmail.com',

  // WhatsApp (Twilio)
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID || '',
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN || '',
  twilioWhatsAppFrom: process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886',

  // Admin
  adminSecretKey: process.env.ADMIN_SECRET_KEY || 'vyapar-sarthi-admin-secret-2025',
  adminEmail: process.env.ADMIN_EMAIL || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  adminName: process.env.ADMIN_NAME || 'Admin',
};
