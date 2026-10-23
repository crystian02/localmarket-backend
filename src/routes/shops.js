// src/routes/shops.js
// Este archivo controla todo lo relacionado con las tiendas.
// Permite listar tiendas, ver una tienda en detalle,
// crear nuevas tiendas y actualizar la información de una tienda.

import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';

const router = express.Router();

// GET /api/shops
// Devuelve todas las tiendas ordenadas por fecha de creación.
// Se usa para mostrar el listado general.

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

// GET /api/shops/:shopId
// Devuelve una tienda en particular según su id.
// Se usa para cargar el detalle de una tienda.

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

// POST /api/shops
// Crea una nueva tienda.
// Requiere autenticación y además permisos de superadmin o shop_admin.

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

    // Se exige nombre y slug
    if (!name || !slug) {
      return res.status(400).json({ message: 'name y slug son requeridos' });
    }

    // También se exige latitud y longitud
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ message: 'latitude y longitude son requeridos' });
    }

    // Validamos que la slug no esté repetida
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

    // Construimos el punto geográfico para la columna `location`
    // Esto permite que la tienda tenga coordenadas espaciales validas.
    const point = `SRID=4326;POINT(${longitude} ${latitude})`;

    // Insertamos la tienda
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
          latitude: Number(latitude),
          longitude: Number(longitude),
          location: point,
          is_active: false
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

// PATCH /api/shops/:shopId
// Actualiza los datos de una tienda.
// Solo puede hacerlo el dueño o un administrador.
router.patch('/shops/:shopId', authMiddleware, async (req, res) => {
  try {
    const { shopId } = req.params;
    const { name, slug, category, description, phone, latitude, longitude, is_active } = req.body;

    // Primero revisamos si la tienda existe
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

    // Revisamos permisos
    const isOwner = shop.owner_id === req.user.id;
    const isAdmin = ['superadmin', 'shop_admin'].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'No tienes permisos para editar esta tienda' });
    }

    // Construimos un payload con los cambios que se quieren aplicar
    const updatePayload = {
      ...(name !== undefined && { name }),
      ...(slug !== undefined && { slug }),
      ...(category !== undefined && { category }),
      ...(description !== undefined && { description }),
      ...(phone !== undefined && { phone }),
      ...(latitude !== undefined && { latitude: Number(latitude) }),
      ...(longitude !== undefined && { longitude: Number(longitude) }),
      ...(latitude !== undefined && longitude !== undefined && {
        location: `SRID=4326;POINT(${Number(longitude)} ${Number(latitude)})`
      }),
      ...(is_active !== undefined && { is_active })
    };

    // Actualizamos la tienda
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