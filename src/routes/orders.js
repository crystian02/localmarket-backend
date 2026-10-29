// src/routes/orders.js
// Este archivo controla todo lo relacionado con los pedidos.
// Permite ver los pedidos del usuario actual, crear un pedido nuevo,
// validar el stock de los productos, asignar un driver y actualizar
// el estado de un pedido.

import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';
import { getSocketServer } from '../socket/index.js';
import { calculateDeliveryFee } from '../services/delivery.js';

const router = express.Router();

const VALID_STATUS_TRANSITIONS = {
  created: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['accepted', 'cancelled'],
  accepted: ['picked_up', 'cancelled'],
  picked_up: ['in_route', 'cancelled'],
  in_route: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: []
};

const VALID_STATUSES = Object.keys(VALID_STATUS_TRANSITIONS);
const ASSIGNABLE_STATUSES = ['created', 'confirmed', 'preparing', 'ready'];

function emitStatusChanged(orderId, status) {
  const io = getSocketServer();
  if (io) {
    io.to(`order_${orderId}`).emit('order:status_changed', {
      orderId,
      status,
      updatedAt: new Date().toISOString()
    });
  }
}

async function canManageOrder(user, order) {
  if (user.role === 'superadmin') {
    return { allowed: true };
  }

  const { data: shop, error: shopError } = await supabaseAdmin
    .from('shops')
    .select('owner_id')
    .eq('id', order.shop_id)
    .maybeSingle();

  if (shopError) return { allowed: false, error: shopError };
  if (shop && shop.owner_id === user.id) return { allowed: true };

  const { data: shopAdmin, error: adminError } = await supabaseAdmin
    .from('shop_admins')
    .select('user_id')
    .eq('shop_id', order.shop_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (adminError) return { allowed: false, error: adminError };
  return { allowed: Boolean(shopAdmin) };
}

async function releaseStock(items) {
  for (const item of items) {
    const { error } = await supabaseAdmin.rpc('increment_stock', {
      p_product_id: item.product_id,
      p_quantity: item.quantity
    });
    if (error) {
      console.error(`No se pudo devolver stock del producto ${item.product_id}:`, error.message);
    }
  }
}

async function reserveStock(items) {
  const reserved = [];
  for (const item of items) {
    const { data, error } = await supabaseAdmin.rpc('decrement_stock', {
      p_product_id: item.product_id,
      p_quantity: item.quantity
    });

    if (error || data !== true) {
      await releaseStock(reserved);
      return { ok: false, failedItem: item, error };
    }
    reserved.push(item);
  }
  return { ok: true, reserved };
}

function normalizeItems(rawItems) {
  const merged = new Map();
  for (const raw of rawItems) {
    const productId = raw?.product_id;
    const quantity = Number(raw?.quantity);
    if (!productId || !Number.isInteger(quantity) || quantity <= 0) return null;
    merged.set(productId, (merged.get(productId) || 0) + quantity);
  }
  return Array.from(merged, ([product_id, quantity]) => ({ product_id, quantity }));
}

// GET /api/orders
router.get('/orders', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('customer_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) return errorResponse(res, error.message, 'ORDERS_FETCH_ERROR', 400);
    return successResponse(res, data, 200);
  } catch (error) {
    console.error('GET /orders error:', error);
    return errorResponse(res, 'Error obteniendo pedidos', 'ORDERS_FETCH_FAILED', 500);
  }
});

// POST /api/orders
router.post('/orders', authMiddleware, async (req, res) => {
  try {
    const { shop_id, delivery_address, delivery_latitude, delivery_longitude } = req.body;

    if (!shop_id || !delivery_address || !Array.isArray(req.body.items) || req.body.items.length === 0) {
      return errorResponse(res, 'shop_id, delivery_address e items son requeridos', 'ORDER_INVALID_INPUT', 400);
    }

    if (delivery_latitude === undefined || delivery_longitude === undefined) {
      return errorResponse(res, 'delivery_latitude y delivery_longitude son requeridos', 'ORDER_LOCATION_REQUIRED', 400);
    }

    const items = normalizeItems(req.body.items);
    if (!items) {
      return errorResponse(res, 'Cada item requiere product_id y una quantity entera mayor a 0', 'ORDER_INVALID_ITEMS', 400);
    }

    const { data: shop, error: shopError } = await supabaseAdmin
      .from('shops')
      .select('id, is_active, latitude, longitude, delivery_config')
      .eq('id', shop_id)
      .maybeSingle();

    if (shopError) return errorResponse(res, shopError.message, 'SHOP_QUERY_ERROR', 400);
    if (!shop) return errorResponse(res, 'Tienda no encontrada', 'SHOP_NOT_FOUND', 404);
    if (!shop.is_active) return errorResponse(res, 'La tienda no está activa', 'SHOP_INACTIVE', 400);

    let deliveryFeeCents;
    try {
      deliveryFeeCents = calculateDeliveryFee(shop, Number(delivery_latitude), Number(delivery_longitude));
    } catch (feeError) {
      return errorResponse(res, feeError.message || 'No se pudo calcular el costo de envío', 'DELIVERY_FEE_ERROR', 400);
    }

    const productIds = items.map(item => item.product_id);

    const { data: products, error: productsError } = await supabaseAdmin
      .from('products')
      .select('*')
      .in('id', productIds);

    if (productsError) return errorResponse(res, productsError.message, 'PRODUCTS_QUERY_ERROR', 400);

    if (products.length !== productIds.length) {
      return errorResponse(res, 'Hay productos inválidos en el pedido', 'ORDER_INVALID_PRODUCTS', 400);
    }

    let subtotalCents = 0;

    for (const item of items) {
      const product = products.find(p => p.id === item.product_id);
      if (!product) return errorResponse(res, `Producto ${item.product_id} no encontrado`, 'ORDER_PRODUCT_NOT_FOUND', 400);
      if (product.shop_id !== shop_id) return errorResponse(res, `El producto ${product.name} no pertenece a esta tienda`, 'ORDER_PRODUCT_WRONG_SHOP', 400);
      if (!product.is_available || Number(product.stock) < item.quantity) {
        return errorResponse(res, `Stock insuficiente para ${product.name}`, 'INSUFFICIENT_STOCK', 400);
      }
      subtotalCents += Number(product.price_cents) * item.quantity;
    }

    const totalAmountCents = subtotalCents + deliveryFeeCents;

    const reservation = await reserveStock(items);
    if (!reservation.ok) {
      const failedProduct = products.find(p => p.id === reservation.failedItem.product_id);
      return errorResponse(res, `Stock insuficiente para ${failedProduct?.name || 'un producto'}`, 'INSUFFICIENT_STOCK', 400);
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert([{
        customer_id: req.user.id,
        shop_id,
        status: 'created',
        delivery_address,
        delivery_latitude: delivery_latitude ?? null,
        delivery_longitude: delivery_longitude ?? null,
        total_amount_cents: totalAmountCents,
        delivery_fee_cents: deliveryFeeCents
      }])
      .select()
      .single();

    if (orderError) {
      await releaseStock(items);
      return errorResponse(res, orderError.message, 'ORDER_CREATE_ERROR', 400);
    }

    const orderItems = items.map(item => {
      const product = products.find(p => p.id === item.product_id);
      return {
        order_id: order.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price_cents: Number(product.price_cents)
      };
    });

    const { error: itemsError } = await supabaseAdmin.from('order_items').insert(orderItems);

    if (itemsError) {
      await supabaseAdmin.from('orders').delete().eq('id', order.id);
      await releaseStock(items);
      return errorResponse(res, itemsError.message, 'ORDER_ITEMS_CREATE_ERROR', 400);
    }

    return successResponse(res, { order: { ...order, subtotal_cents: subtotalCents } }, 201);
  } catch (error) {
    console.error('POST /orders error:', error);
    return errorResponse(res, 'Error creando pedido', 'ORDER_CREATE_FAILED', 500);
  }
});

// POST /api/orders/:orderId/assign-driver
router.post('/orders/:orderId/assign-driver', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { driver_id } = req.body;

    if (!driver_id) {
      return errorResponse(res, 'driver_id es requerido', 'MISSING_DRIVER_ID', 400);
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders').select('*').eq('id', orderId).maybeSingle();

    if (orderError) return errorResponse(res, orderError.message, 'ORDER_QUERY_ERROR', 400);
    if (!order) return errorResponse(res, 'Pedido no encontrado', 'ORDER_NOT_FOUND', 404);

    const { allowed, error: permError } = await canManageOrder(req.user, order);
    if (permError) return errorResponse(res, permError.message, 'PERMISSION_QUERY_ERROR', 400);
    if (!allowed) return errorResponse(res, 'No tienes permisos para asignar un driver a este pedido', 'ORDER_FORBIDDEN', 403);

    const currentStatus = order.status || 'created';
    if (!ASSIGNABLE_STATUSES.includes(currentStatus)) {
      return errorResponse(res, `No se puede asignar un driver a un pedido en estado ${currentStatus}`, 'ORDER_NOT_ASSIGNABLE', 400);
    }

    // CORRECCIÓN: Validar al driver antes de asignarlo
    const { data: driverProfile, error: driverError } = await supabaseAdmin
      .from('profiles')
      .select('id, role, is_available')
      .eq('id', driver_id)
      .maybeSingle();

    if (driverError) {
      return errorResponse(res, driverError.message, 'DRIVER_QUERY_ERROR', 400);
    }
    if (!driverProfile) {
      return errorResponse(res, 'Driver no encontrado', 'DRIVER_NOT_FOUND', 404);
    }
    if (driverProfile.role !== 'driver') {
      return errorResponse(res, 'El usuario asignado no es un driver', 'DRIVER_INVALID_ROLE', 400);
    }
    if (!driverProfile.is_available) {
      return errorResponse(res, 'El driver no está disponible', 'DRIVER_NOT_AVAILABLE', 400);
    }

    // Actualizamos solo si el estado no cambió mientras tanto
    const { data, error } = await supabaseAdmin
      .from('orders')
      .update({ driver_id, status: 'accepted' })
      .eq('id', orderId)
      .eq('status', currentStatus)
      .select()
      .maybeSingle();

    if (error) return errorResponse(res, error.message, 'ORDER_ASSIGN_DRIVER_ERROR', 400);
    if (!data) return errorResponse(res, 'El pedido cambió de estado, vuelve a intentarlo', 'ORDER_STATUS_CONFLICT', 409);

    emitStatusChanged(orderId, 'accepted');
    return successResponse(res, { order: data }, 200);
  } catch (error) {
    console.error('POST /orders/:orderId/assign-driver error:', error);
    return errorResponse(res, 'Error asignando driver', 'ORDER_ASSIGN_DRIVER_FAILED', 500);
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

    if (status === 'accepted') {
      return errorResponse(res, 'Para pasar a accepted debes asignar un driver con assign-driver', 'USE_ASSIGN_DRIVER', 400);
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders').select('*').eq('id', orderId).maybeSingle();

    if (orderError) return errorResponse(res, orderError.message, 'ORDER_QUERY_ERROR', 400);
    if (!order) return errorResponse(res, 'Pedido no encontrado', 'ORDER_NOT_FOUND', 404);

    const { allowed, error: permError } = await canManageOrder(req.user, order);
    if (permError) return errorResponse(res, permError.message, 'PERMISSION_QUERY_ERROR', 400);
    if (!allowed) return errorResponse(res, 'No tienes permisos para cambiar el estado del pedido', 'ORDER_FORBIDDEN', 403);

    const currentStatus = order.status || 'created';
    if (!VALID_STATUS_TRANSITIONS[currentStatus]?.includes(status)) {
      return errorResponse(res, `No puedes pasar de ${currentStatus} a ${status}`, 'INVALID_ORDER_TRANSITION', 400);
    }

    const { data, error } = await supabaseAdmin
      .from('orders')
      .update({ status })
      .eq('id', orderId)
      .eq('status', currentStatus)
      .select()
      .maybeSingle();

    if (error) return errorResponse(res, error.message, 'ORDER_STATUS_UPDATE_ERROR', 400);
    if (!data) return errorResponse(res, 'El pedido cambió de estado, vuelve a intentarlo', 'ORDER_STATUS_CONFLICT', 409);

    emitStatusChanged(orderId, status);
    return successResponse(res, { order: data }, 200);
  } catch (error) {
    console.error('PATCH /orders/:orderId/status error:', error);
    return errorResponse(res, 'Error actualizando estado del pedido', 'ORDER_STATUS_UPDATE_FAILED', 500);
  }
});

export default router;