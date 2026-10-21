//src/routes/products.js

import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';

const router = express.Router();

router.get('/shops/:shopId/products', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('products')
    .select('*')
    .eq('shop_id', req.params.shopId)
    .eq('is_available', true);

  if (error) {
    return res.status(500).json({ message: error.message });
  }

  res.json(data);
});

router.post('/shops/:shopId/products', authMiddleware, requireRole('superadmin', 'shop_admin'), async (req, res) => {
  const { name, description, price_cents, stock, aisle_id, image_url, brand, tags } = req.body;

  if (!name || price_cents == null || stock == null) {
    return res.status(400).json({ message: 'Faltan datos del producto' });
  }

  const { data, error } = await supabaseAdmin
    .from('products')
    .insert([
      {
        shop_id: req.params.shopId,
        aisle_id: aisle_id || null,
        name,
        description,
        price_cents,
        stock,
        image_url: image_url || null,
        is_available: true,
        brand: brand || null,
        tags: tags || []
      }
    ])
    .select()
    .single();

  if (error) {
    return res.status(400).json({ message: error.message });
  }

  return res.status(201).json(data);
});

router.patch('/products/:productId', authMiddleware, requireRole('superadmin', 'shop_admin'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('products')
    .update(req.body)
    .eq('id', req.params.productId)
    .select()
    .single();

  if (error) {
    return res.status(400).json({ message: error.message });
  }

  return res.json(data);
});

export default router;