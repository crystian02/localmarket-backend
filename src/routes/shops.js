import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';

const router = express.Router();

router.get('/shops', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('shops')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    return res.json(data);
  } catch (error) {
    console.error('GET /shops error:', error);
    return res.status(500).json({ message: 'Error obteniendo tiendas' });
  }
});

router.get('/shops/:shopId', authMiddleware, async (req, res) => {
  try {
    const { shopId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('shops')
      .select('*')
      .eq('id', shopId)
      .maybeSingle();

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    if (!data) {
      return res.status(404).json({ message: 'Tienda no encontrada' });
    }

    return res.json(data);
  } catch (error) {
    console.error('GET /shops/:shopId error:', error);
    return res.status(500).json({ message: 'Error obteniendo tienda' });
  }
});

router.post('/shops', authMiddleware, requireRole('superadmin', 'shop_admin'), async (req, res) => {
  try {
    const {
      name,
      slug,
      category,
      description,
      phone,
      latitude,
      longitude
    } = req.body;

    if (!name || !slug) {
      return res.status(400).json({ message: 'name y slug son requeridos' });
    }

    const { data: existingShop, error: existingError } = await supabaseAdmin
      .from('shops')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (existingError) {
      return res.status(400).json({ message: existingError.message });
    }

    if (existingShop) {
      return res.status(409).json({ message: 'La slug de la tienda ya existe' });
    }

    const { data, error } = await supabaseAdmin
      .from('shops')
      .insert([
        {
          owner_id: req.user.id,
          name,
          slug,
          category: category || 'General',
          description: description || null,
          phone: phone || null,
          latitude: latitude || null,
          longitude: longitude || null,
          is_active: false,
          created_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    return res.status(201).json({ shop: data });
  } catch (error) {
    console.error('POST /shops error:', error);
    return res.status(500).json({ message: 'Error creando tienda' });
  }
});

router.patch('/shops/:shopId', authMiddleware, async (req, res) => {
  try {
    const { shopId } = req.params;
    const { name, slug, category, description, phone, latitude, longitude, is_active } = req.body;

    const { data: shop, error: shopError } = await supabaseAdmin
      .from('shops')
      .select('*')
      .eq('id', shopId)
      .maybeSingle();

    if (shopError) {
      return res.status(400).json({ message: shopError.message });
    }

    if (!shop) {
      return res.status(404).json({ message: 'Tienda no encontrada' });
    }

    const isOwner = shop.owner_id === req.user.id;
    const isAdmin = ['superadmin', 'shop_admin'].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'No tienes permisos para editar esta tienda' });
    }

    const updatePayload = {
      ...(name !== undefined && { name }),
      ...(slug !== undefined && { slug }),
      ...(category !== undefined && { category }),
      ...(description !== undefined && { description }),
      ...(phone !== undefined && { phone }),
      ...(latitude !== undefined && { latitude }),
      ...(longitude !== undefined && { longitude }),
      ...(is_active !== undefined && { is_active })
    };

    const { data, error } = await supabaseAdmin
      .from('shops')
      .update(updatePayload)
      .eq('id', shopId)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    return res.json({ shop: data });
  } catch (error) {
    console.error('PATCH /shops/:shopId error:', error);
    return res.status(500).json({ message: 'Error actualizando tienda' });
  }
});

export default router;