import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import prisma from '../db.js';

export function authenticateUser(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ detail: 'Not authenticated' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (!payload.sub) return res.status(401).json({ detail: 'Invalid token' });
    req.userId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ detail: 'Invalid token' });
  }
}

export async function getCurrentUser(req, res, next) {
  try {
    const user = await prisma.user.findUnique({ where: { uuid: req.userId } });
    if (!user) return res.status(401).json({ detail: 'User not found' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(500).json({ detail: 'Error fetching user' });
  }
}

export async function getCurrentShop(req, res, next) {
  try {
    const shop = await prisma.shop.findFirst({ where: { ownerId: req.user.uuid } });
    if (!shop) return res.status(404).json({ detail: 'Shop not found' });
    req.shop = shop;
    next();
  } catch (err) {
    return res.status(500).json({ detail: 'Error fetching shop' });
  }
}

export function authenticateAdmin(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ detail: 'Not authenticated' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    if (!payload.sub) return res.status(401).json({ detail: 'Invalid token' });
    req.adminId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ detail: 'Invalid token' });
  }
}

export async function getAdminUser(req, res, next) {
  try {
    const admin = await prisma.adminUser.findUnique({ where: { id: req.adminId } });
    if (!admin || !admin.isActive) return res.status(401).json({ detail: 'Admin not found or inactive' });
    req.admin = admin;
    next();
  } catch (err) {
    return res.status(500).json({ detail: 'Error fetching admin' });
  }
}
