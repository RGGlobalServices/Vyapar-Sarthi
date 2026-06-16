// Runs once when the Next.js server process boots. Replaces the seedAdmin()
// call the former Express backend ran on startup.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const [{ config }, { default: prisma }, bcrypt] = await Promise.all([
    import('./lib/server/config'),
    import('./lib/server/prisma'),
    import('bcryptjs'),
  ]);

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
    console.error('[seed] Admin seed error:', err instanceof Error ? err.message : err);
  }
}
