// src/routes/shops.js
// Este archivo controla todo lo relacionado con las tiendas.
// Permite listar tiendas, ver una tienda en detalle,
// crear nuevas tiendas y actualizar la información de una tienda.

import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';

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
      return errorResponse(res, error.message, 'SHOPS_FETCH_ERROR', 400);
    }

    return successResponse(res, data, 200);
  } catch (error) {
    console.error('GET /shops error:', error);
    return errorResponse(res, 'Error obteniendo tiendas', 'SHOPS_FETCH_FAILED', 500);
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
      return errorResponse(res, error.message, 'SHOP_FETCH_ERROR', 400);
    }

    if (!data) {
      return errorResponse(res, 'Tienda no encontrada', 'SHOP_NOT_FOUND', 404);
    }

    return successResponse(res, data, 200);
  } catch (error) {
    console.error('GET /shops/:shopId error:', error);
    return errorResponse(res, 'Error obteniendo tienda', 'SHOP_FETCH_FAILED', 500);
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

    if (!name || !slug) {
      return errorResponse(
        res,
        'name y slug son requeridos',
        'SHOP_INVALID_INPUT',
        400
      );
    }

    if (latitude === undefined || longitude === undefined) {
      return errorResponse(
        res,
        'latitude y longitude son requeridos',
        'SHOP_LOCATION_INVALID',
        400
      );
    }

    const { data: existingShop, error: existingError } = await supabaseAdmin
      .from('shops')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (existingError) {
      return errorResponse(res, existingError.message, 'SHOP_CHECK_ERROR', 400);
    }

    if (existingShop) {
      return errorResponse(res, 'La slug de la tienda ya existe', 'SHOP_SLUG_EXISTS', 409);
    }

    const point = `SRID=4326;POINT(${longitude} ${latitude})`;

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
      return errorResponse(res, error.message, 'SHOP_CREATE_ERROR', 400);
    }

    return successResponse(res, { shop: data }, 201);
  } catch (error) {
    console.error('POST /shops error:', error);
    return errorResponse(res, 'Error creando tienda', 'SHOP_CREATE_FAILED', 500);
  }
});

// PATCH /api/shops/:shopId
// Actualiza los datos de una tienda.
// Solo puede hacerlo el dueño o un administrador.
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
      return errorResponse(res, shopError.message, 'SHOP_QUERY_ERROR', 400);
    }

    if (!shop) {
      return errorResponse(res, 'Tienda no encontrada', 'SHOP_NOT_FOUND', 404);
    }

    const isOwner = shop.owner_id === req.user.id;
    
    // CORRECCIÓN DE SEGURIDAD:
    // Antes se usaba: const isAdmin = ['superadmin', 'shop_admin'].includes(req.user.role);
    // Eso permitía que cualquier shop_admin editara cualquier tienda.
    // Ahora verificamos si el shop_admin está asignado a ESTA tienda específica.
    let isAssignedAdmin = false;
    if (req.user.role === 'shop_admin') {
      const { data: assignment } = await supabaseAdmin
        .from('shop_admins')
        .select('user_id')
        .eq('shop_id', shopId)
        .eq('user_id', req.user.id)
        .maybeSingle();
      isAssignedAdmin = Boolean(assignment);
    }
    
    const isSuperAdmin = req.user.role === 'superadmin';

    if (!isOwner && !isAssignedAdmin && !isSuperAdmin) {
      return errorResponse(
        res,
        'No tienes permisos para editar esta tienda',
        'SHOP_FORBIDDEN',
        403
      );
    }

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

    const { data, error } = await supabaseAdmin
      .from('shops')
      .update(updatePayload)
      .eq('id', shopId)
      .select()
      .single();

    if (error) {
      return errorResponse(res, error.message, 'SHOP_UPDATE_ERROR', 400);
    }

    return successResponse(res, { shop: data }, 200);
  } catch (error) {
    console.error('PATCH /shops/:shopId error:', error);
    return errorResponse(res, 'Error actualizando tienda', 'SHOP_UPDATE_FAILED', 500);
  }
});

export default router;