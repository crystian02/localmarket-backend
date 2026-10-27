//src/routes/orders.js

// Este archivo controla todo lo relacionado con los pedidos.
// Permite ver los pedidos del usuario actual, crear un pedido nuevo,
// validar el stock de los productos y actualizar el estado de un pedido.

import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';

const router = express.Router();

const VALID_STATUSES = [
  'created',
  'confirmed',
  'preparing',
  'ready',
  'picked_up',
  'in_route',
  'delivered',
  'cancelled'
];

// GET /api/orders
router.get('/orders', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('customer_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return errorResponse(res, error.message, 'ORDERS_FETCH_ERROR', 400);
    }

    return successResponse(res, data, 200);
  } catch (error) {
    console.error('GET /orders error:', error);
    return errorResponse(res, 'Error obteniendo pedidos', 'ORDERS_FETCH_FAILED', 500);
  }
});

// POST /api/orders
router.post('/orders', authMiddleware, async (req, res) => {
  try {
    const { shop_id, delivery_address, delivery_latitude, delivery_longitude, items } = req.body;

    if (!shop_id || !Array.isArray(items) || items.length === 0) {
      return errorResponse(
        res,
        'shop_id e items son requeridos',
        'ORDER_INVALID_INPUT',
        400
      );
    }

    const { data: shop, error: shopError } = await supabaseAdmin
      .from('shops')
      .select('id, is_active')
      .eq('id', shop_id)
      .maybeSingle();

    if (shopError) {
      return errorResponse(res, shopError.message, 'SHOP_QUERY_ERROR', 400);
    }

    if (!shop) {
      return errorResponse(res, 'Tienda no encontrada', 'SHOP_NOT_FOUND', 404);
    }

    if (!shop.is_active) {
      return errorResponse(res, 'La tienda no está activa', 'SHOP_INACTIVE', 400);
    }

    const productIds = items.map(item => item.product_id);

    const { data: products, error: productsError } = await supabaseAdmin
      .from('products')
      .select('*')
      .in('id', productIds);

    if (productsError) {
      return errorResponse(res, productsError.message, 'PRODUCTS_QUERY_ERROR', 400);
    }

    if (products.length !== productIds.length) {
      return errorResponse(
        res,
        'Hay productos inválidos en el pedido',
        'ORDER_INVALID_PRODUCTS',
        400
      );
    }

    let totalAmountCents = 0;

    for (const item of items) {
      const product = products.find(p => p.id === item.product_id);

      if (!product) {
        return errorResponse(
          res,
          `Producto ${item.product_id} no encontrado`,
          'ORDER_PRODUCT_NOT_FOUND',
          400
        );
      }

      if (!product.is_available || Number(product.stock) < Number(item.quantity)) {
        return errorResponse(
          res,
          `Stock insuficiente para ${product.name}`,
          'INSUFFICIENT_STOCK',
          400
        );
      }

      totalAmountCents += Number(product.price_cents) * Number(item.quantity);
    }

    const deliveryFeeCents = 1000;

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert([
        {
          customer_id: req.user.id,
          shop_id,
          status: 'created',
          delivery_address: delivery_address || null,
          delivery_latitude: delivery_latitude || null,
          delivery_longitude: delivery_longitude || null,
          total_amount_cents: totalAmountCents,
          delivery_fee_cents: deliveryFeeCents,
          created_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (orderError) {
      return errorResponse(res, orderError.message, 'ORDER_CREATE_ERROR', 400);
    }

    const orderItems = items.map(item => {
      const product = products.find(p => p.id === item.product_id);

      return {
        order_id: order.id,
        product_id: item.product_id,
        quantity: Number(item.quantity),
        unit_price_cents: Number(product.price_cents),
        created_at: new Date().toISOString()
      };
    });

    const { error: itemsError } = await supabaseAdmin
      .from('order_items')
      .insert(orderItems);

    if (itemsError) {
      await supabaseAdmin.from('orders').delete().eq('id', order.id);
      return errorResponse(res, itemsError.message, 'ORDER_ITEMS_CREATE_ERROR', 400);
    }

    for (const item of items) {
      const product = products.find(p => p.id === item.product_id);

      await supabaseAdmin
        .from('products')
        .update({
          stock: Number(product.stock) - Number(item.quantity)
        })
        .eq('id', item.product_id);
    }

    return successResponse(
      res,
      {
        order: {
          ...order,
          total_amount_cents: totalAmountCents + deliveryFeeCents
        }
      },
      201
    );
  } catch (error) {
    console.error('POST /orders error:', error);
    return errorResponse(res, 'Error creando pedido', 'ORDER_CREATE_FAILED', 500);
  }
});

// PATCH /api/orders/:orderId/status
router.patch('/orders/:orderId/status', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    if (!VALID_STATUSES.includes(status)) {
      return errorResponse(res, 'Estado inválido', 'INVALID_ORDER_STATUS', 400);
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (orderError) {
      return errorResponse(res, orderError.message, 'ORDER_QUERY_ERROR', 400);
    }

    if (!order) {
      return errorResponse(res, 'Pedido no encontrado', 'ORDER_NOT_FOUND', 404);
    }

    const { data: shop, error: shopError } = await supabaseAdmin
      .from('shops')
      .select('owner_id')
      .eq('id', order.shop_id)
      .maybeSingle();

    if (shopError) {
      return errorResponse(res, shopError.message, 'SHOP_QUERY_ERROR', 400);
    }

    const isOwner = shop && shop.owner_id === req.user.id;
    const isAdmin = ['superadmin', 'shop_admin'].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return errorResponse(
        res,
        'No tienes permisos para cambiar el estado del pedido',
        'ORDER_FORBIDDEN',
        403
      );
    }

    const { data, error } = await supabaseAdmin
      .from('orders')
      .update({ status })
      .eq('id', orderId)
      .select()
      .single();

    if (error) {
      return errorResponse(res, error.message, 'ORDER_STATUS_UPDATE_ERROR', 400);
    }

    return successResponse(res, { order: data }, 200);
  } catch (error) {
    console.error('PATCH /orders/:orderId/status error:', error);
    return errorResponse(
      res,
      'Error actualizando estado del pedido',
      'ORDER_STATUS_UPDATE_FAILED',
      500
    );
  }
});

export default router;