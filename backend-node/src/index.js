import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { config } from './config.js';
import prisma from './db.js';

const app = express();

// Seed default admin from env vars on startup
async function seedAdmin() {
  if (!config.adminEmail || !config.adminPassword) {
    console.log('[seed] ADMIN_EMAIL or ADMIN_PASSWORD not set, skipping admin seed');
    return;
  }
  try {
    const existing = await prisma.adminUser.findUnique({ where: { email: config.adminEmail } });
    const hashedPassword = await bcrypt.hash(config.adminPassword, 10);
    if (existing) {
      await prisma.adminUser.update({
        where: { email: config.adminEmail },
        data: { hashedPassword, fullName: config.adminName || existing.fullName, isActive: 1 },
      });
      console.log(`[seed] Updated admin: ${config.adminEmail}`);
    } else {
      await prisma.adminUser.create({
        data: { email: config.adminEmail, hashedPassword, fullName: config.adminName, role: 'superadmin', isActive: 1 },
      });
      console.log(`[seed] Created admin: ${config.adminEmail}`);
    }
  } catch (err) {
    console.error('[seed] Admin seed error:', err.message);
  }
}

app.use(cors({ origin: config.corsOrigins, credentials: true, methods: ['*'], allowedHeaders: ['*'] }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (res.statusCode >= 400) {
      console.error(`[${req.method}] ${req.originalUrl} ${res.statusCode} ${ms}ms`);
    }
  });
  next();
});

// Routes
import authRoutes from './routes/auth.js';
import productRoutes from './routes/products.js';
import billingRoutes from './routes/billing.js';
import customerRoutes from './routes/customers.js';
import reportRoutes from './routes/reports.js';
import shopRoutes from './routes/shop.js';
import notificationRoutes from './routes/notifications.js';
import paymentRoutes from './routes/payments.js';
import referralRoutes from './routes/referrals.js';
import supportRoutes from './routes/support.js';
import dukandarRoutes from './routes/dukandar.js';
import dukandarAlertRoutes from './routes/dukandarAlerts.js';
import adminRoutes from './routes/admin.js';

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/billing', billingRoutes);
app.use('/api/v1/customers', customerRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/shop', shopRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/referrals', referralRoutes);
app.use('/api/v1/support', supportRoutes);
app.use('/api/v1/dukandar', dukandarRoutes);
app.use('/api/v1/dukandar', dukandarAlertRoutes);
app.use('/api/v1/admin', adminRoutes);

app.get('/', (req, res) => res.json({ message: 'Kirana Smart Dashboard API is running' }));

app.get('/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    const tables = await prisma.$queryRaw`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`;
    res.json({ status: 'ok', db: 'connected', tables: tables.map(t => t.table_name) });
  } catch (e) {
    res.json({ status: 'error', detail: e.message });
  }
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message, err.stack?.split('\n').slice(0,5).join('\n'));
  res.status(500).json({ detail: err.message || 'Internal server error' });
});

seedAdmin().then(() => {
  app.listen(config.port, () => console.log(`Backend running on port ${config.port}`));
});

export default app;
