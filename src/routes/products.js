// src/routes/products.js
// Este archivo controla todo lo relacionado con los productos de una tienda.
// Permite listar los productos de una tienda,
// crear nuevos productos,
// y actualizar datos como precio, stock, imagen, marca o disponibilidad.

import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';

const router = express.Router();

// GET /api/shops/:shopId/products
// Devuelve todos los productos asociados a una tienda.
// Se usa para mostrar el catálogo en la app.
router.get('/shops/:shopId/products', authMiddleware, async (req, res) => {
  try {
    const { shopId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('shop_id', shopId)
      .order('created_at', { ascending: false });

    if (error) {
      return errorResponse(res, error.message, 'PRODUCTS_FETCH_ERROR', 400);
    }

    return successResponse(res, data, 200);
  } catch (error) {
    console.error('GET /shops/:shopId/products error:', error);
    return errorResponse(res, 'Error obteniendo productos', 'PRODUCTS_FETCH_FAILED', 500);
  }
});

// POST /api/shops/:shopId/products
// Crea un producto dentro de una tienda.
// Solo pueden hacerlo el dueño o un admin de la tienda.
router.post('/shops/:shopId/products', authMiddleware, requireRole('superadmin', 'shop_admin'), async (req, res) => {
  try {
    const { shopId } = req.params;
    const {
      name,
      description,
      price_cents,
      stock,
      brand,
      tags,
      image_url
    } = req.body;

    if (!name || price_cents === undefined || stock === undefined) {
      return errorResponse(
        res,
        'name, price_cents y stock son requeridos',
        'PRODUCT_INVALID_INPUT',
        400
      );
    }

    const { data: shop, error: shopError } = await supabaseAdmin
      .from('shops')
      .select('id, owner_id')
      .eq('id', shopId)
      .maybeSingle();

    if (shopError) {
      return errorResponse(res, shopError.message, 'SHOP_QUERY_ERROR', 400);
    }

    if (!shop) {
      return errorResponse(res, 'Tienda no encontrada', 'SHOP_NOT_FOUND', 404);
    }

    const isOwner = shop.owner_id === req.user.id;
    const isAdmin = ['superadmin', 'shop_admin'].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return errorResponse(
        res,
        'No tienes permisos para agregar productos a esta tienda',
        'PRODUCT_FORBIDDEN',
        403
      );
    }

    if (Number(price_cents) < 0) {
      return errorResponse(res, 'price_cents no puede ser negativo', 'PRODUCT_INVALID_PRICE', 400);
    }

    if (Number(stock) < 0) {
      return errorResponse(res, 'stock no puede ser negativo', 'PRODUCT_INVALID_STOCK', 400);
    }

    const { data, error } = await supabaseAdmin
      .from('products')
      .insert([
        {
          shop_id: shopId,
          name,
          description: description || null,
          price_cents: Number(price_cents),
          stock: Number(stock),
          brand: brand || null,
          tags: tags || [],
          image_url: image_url || null,
          is_available: true,
          created_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (error) {
      return errorResponse(res, error.message, 'PRODUCT_CREATE_ERROR', 400);
    }

    return successResponse(res, { product: data }, 201);
  } catch (error) {
    console.error('POST /shops/:shopId/products error:', error);
    return errorResponse(res, 'Error creando producto', 'PRODUCT_CREATE_FAILED', 500);
  }
});

// PATCH /api/shops/:shopId/products/:productId
// Actualiza un producto existente.
// Se puede cambiar nombre, precio, stock, imagen, marca, tags y disponibilidad.
router.patch('/shops/:shopId/products/:productId', authMiddleware, async (req, res) => {
  try {
    const { shopId, productId } = req.params;
    const {
      name,
      description,
      price_cents,
      stock,
      brand,
      tags,
      image_url,
      is_available
    } = req.body;

    const { data: product, error: productError } = await supabaseAdmin
      .from('products')
      .select('*')
      .eq('id', productId)
      .eq('shop_id', shopId)
      .maybeSingle();

    if (productError) {
      return errorResponse(res, productError.message, 'PRODUCT_QUERY_ERROR', 400);
    }

    if (!product) {
      return errorResponse(res, 'Producto no encontrado', 'PRODUCT_NOT_FOUND', 404);
    }

    const { data: shop, error: shopError } = await supabaseAdmin
      .from('shops')
      .select('owner_id')
      .eq('id', shopId)
      .maybeSingle();

    if (shopError) {
      return errorResponse(res, shopError.message, 'SHOP_QUERY_ERROR', 400);
    }

    const isOwner = shop && shop.owner_id === req.user.id;
    const isAdmin = ['superadmin', 'shop_admin'].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return errorResponse(
        res,
        'No tienes permisos para editar este producto',
        'PRODUCT_FORBIDDEN',
        403
      );
    }

    const updatePayload = {
      ...(name !== undefined && { name }),
      ...(description !== undefined && { description }),
      ...(price_cents !== undefined && { price_cents: Number(price_cents) }),
      ...(stock !== undefined && { stock: Number(stock) }),
      ...(brand !== undefined && { brand }),
      ...(tags !== undefined && { tags }),
      ...(image_url !== undefined && { image_url }),
      ...(is_available !== undefined && { is_available })
    };

    const { data, error } = await supabaseAdmin
      .from('products')
      .update(updatePayload)
      .eq('id', productId)
      .select()
      .single();

    if (error) {
      return errorResponse(res, error.message, 'PRODUCT_UPDATE_ERROR', 400);
    }

    return successResponse(res, { product: data }, 200);
  } catch (error) {
    console.error('PATCH /shops/:shopId/products/:productId error:', error);
    return errorResponse(res, 'Error actualizando producto', 'PRODUCT_UPDATE_FAILED', 500);
  }
});

export default router;