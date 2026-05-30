import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../db.js';
import { config } from '../config.js';

const router = Router();

function buildTokenResponse(user) {
  const access_token = jwt.sign(
    { sub: user.uuid },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
  return {
    access_token,
    token_type: 'bearer',
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      storeName: user.storeName,
      mobile: user.mobile,
    },
  };
}

router.get('/ping', (req, res) => res.json({ ok: true }));

router.post('/login', async (req, res) => {
  try {
    console.log('/login body:', JSON.stringify(req.body));
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ detail: 'Wrong user ID or password. Please try again or create a new account.' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ detail: 'Wrong user ID or password. Please try again or create a new account.' });
    res.json(buildTokenResponse(user));
  } catch (err) {
    console.error('/login error:', err);
    res.status(500).json({ detail: err.message });
  }
});

router.post('/register', async (req, res) => {
  try {
    const { email, password, name, fullName, mobile, storeName, shopName, businessType } = req.body;
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ detail: 'Email already registered' });
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        uuid: randomUUID(),
        email,
        password: hashedPassword,
        name: name || null,
        fullName: fullName || null,
        mobile: mobile || null,
        storeName: storeName || null,
        businessType: businessType || null,
      },
    });
    const shopLabel = storeName || shopName || `${email.split('@')[0]}'s Shop`;
    await prisma.shop.create({
      data: { ownerId: user.uuid, name: shopLabel },
    });
    res.status(201).json(buildTokenResponse(user));
  } catch (err) {
    console.error('/register error:', err);
    res.status(500).json({ detail: err.message });
  }
});

export default router;
