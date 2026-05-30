import { Router } from 'express';
import prisma from '../db.js';

const router = Router();

router.get('/', async (req, res) => {
  try {
    const customers = await prisma.customer.findMany();
    res.json(customers);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

router.get('/:customerId', async (req, res) => {
  try {
    const customer = await prisma.customer.findUnique({ where: { id: req.params.customerId } });
    if (!customer) return res.status(404).json({ detail: 'Customer not found' });
    res.json(customer);
  } catch (err) {
    res.status(500).json({ detail: err.message });
  }
});

export default router;
