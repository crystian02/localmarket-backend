import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';

const router = express.Router();

router.get('/shops', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('shops')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ message: error.message });
  }

  return res.json(data);
});

router.get('/shops/:id', async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('shops')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (error) {
    return res.status(404).json({ message: 'Tienda no encontrada' });
  }

  return res.json(data);
});

router.post('/shops', authMiddleware, requireRole('superadmin', 'shop_admin'), async (req, res) => {
  const { name, category, description, phone, latitude, longitude, slug } = req.body;

  if (!name || !category || latitude == null || longitude == null) {
    return res.status(400).json({ message: 'Faltan datos básicos' });
  }

  const point = `POINT(${longitude} ${latitude})`;

  const { data, error } = await supabaseAdmin
    .from('shops')
    .insert([
      {
        name,
        category,
        description,
        phone,
        latitude,
        longitude,
        location: point,
        slug: slug || `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now()}`,
        owner_id: req.user.id,
        is_active: false
      }
    ])
    .select()
    .single();

  if (error) {
    return res.status(400).json({ message: error.message });
  }

  return res.status(201).json(data);
});

export default router;