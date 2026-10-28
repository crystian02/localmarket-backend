// src/routes/orders.js
// Este archivo controla todo lo relacionado con los pedidos.
// Permite ver los pedidos del usuario actual, crear un pedido nuevo,
// validar el stock de los productos y actualizar el estado de un pedido.

import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';
import { getSocketServer } from '../socket/index.js';

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

const VALID_STATUS_TRANSITIONS = {
  created: ['accepted', 'cancelled'],
  accepted: ['picked_up', 'cancelled'],
  picked_up: ['in_route', 'cancelled'],
  in_route: ['delivered', 'cancelled'],
  delivered: [],
  cancelled: []
};

// GET /api/orders
// Devuelve todos los pedidos del usuario autenticado.
// Sirve para ver el historial de compras y el estado actual.

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
// Crea un pedido nuevo para un cliente.
// Primero valida que la tienda exista y esté activa,
// luego valida que los productos existan y tengan stock,
// y finalmente guarda el pedido y cada item del pedido.

router.post('/orders', authMiddleware, async (req, res) => {
  try {
    const { shop_id, delivery_address, delivery_latitude, delivery_longitude, items } = req.body;

    // Validamos que haya una tienda y al menos un producto en el pedido
    if (!shop_id || !Array.isArray(items) || items.length === 0) {
      return errorResponse(
        res,
        'shop_id e items son requeridos',
        'ORDER_INVALID_INPUT',
        400
      );
    }

    // Verificamos que la tienda exista
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

    // La tienda debe estar activa para recibir pedidos
    if (!shop.is_active) {
      return errorResponse(res, 'La tienda no está activa', 'SHOP_INACTIVE', 400);
    }

    // Extraemos los IDs de productos del pedido
    const productIds = items.map(item => item.product_id);

    // Traemos todos los productos que vienen en el pedido
    const { data: products, error: productsError } = await supabaseAdmin
      .from('products')
      .select('*')
      .in('id', productIds);

    if (productsError) {
      return errorResponse(res, productsError.message, 'PRODUCTS_QUERY_ERROR', 400);
    }

    // Si no encuentra todos los productos, algo está mal
    if (products.length !== productIds.length) {
      return errorResponse(
        res,
        'Hay productos inválidos en el pedido',
        'ORDER_INVALID_PRODUCTS',
        400
      );
    }

    // Calculamos el total del pedido
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

      // Validamos que el producto esté disponible y tenga suficiente stock
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

    // Costo fijo de delivery
    const deliveryFeeCents = 1000;

    // Creamos el pedido principal
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

    // Generamos los items del pedido
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

    // Guardamos cada item en order_items
    const { error: itemsError } = await supabaseAdmin
      .from('order_items')
      .insert(orderItems);

    if (itemsError) {
      // Si falla la creación de los items, eliminamos el pedido para no dejar datos inconsistente
      await supabaseAdmin.from('orders').delete().eq('id', order.id);
      return errorResponse(res, itemsError.message, 'ORDER_ITEMS_CREATE_ERROR', 400);
    }

    // Descontamos el stock de cada producto comprado
    for (const item of items) {
      const product = products.find(p => p.id === item.product_id);

      await supabaseAdmin
        .from('products')
        .update({
          stock: Number(product.stock) - Number(item.quantity)
        })
        .eq('id', item.product_id);
    }

    // Devolvemos la respuesta con el pedido creado
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

// POST /api/orders/:orderId/assign-driver
router.post('/orders/:orderId/assign-driver', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { driver_id } = req.body;

    if (!driver_id) {
      return errorResponse(
        res,
        'driver_id es requerido',
        'MISSING_DRIVER_ID',
        400
      );
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

    const { data, error } = await supabaseAdmin
      .from('orders')
      .update({
        driver_id,
        status: 'accepted'
      })
      .eq('id', orderId)
      .select()
      .single();

    if (error) {
      return errorResponse(res, error.message, 'ORDER_ASSIGN_DRIVER_ERROR', 400);
    }

    const io = getSocketServer();
    if (io) {
      io.to(`order_${orderId}`).emit('order:status_changed', {
        orderId,
        status: 'accepted',
        updatedAt: new Date().toISOString()
      });
    }

    return successResponse(res, { order: data }, 200);
  } catch (error) {
    console.error('POST /orders/:orderId/assign-driver error:', error);
    return errorResponse(
      res,
      'Error asignando driver',
      'ORDER_ASSIGN_DRIVER_FAILED',
      500
    );
  }
});

// PATCH /api/orders/:orderId/status
// Permite cambiar el estado de un pedido.
// Solo puede hacerlo el dueño de la tienda, un superadmin o un admin.

router.patch('/orders/:orderId/status', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    // Validamos que el estado venga en la lista permitida
    if (!VALID_STATUSES.includes(status)) {
      return errorResponse(res, 'Estado inválido', 'INVALID_ORDER_STATUS', 400);
    }

    // Revisamos si el pedido existe
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

    const currentStatus = order.status || 'created';

    if (!VALID_STATUS_TRANSITIONS[currentStatus]?.includes(status)) {
      return errorResponse(
        res,
        `No puedes pasar de ${currentStatus} a ${status}`,
        'INVALID_ORDER_TRANSITION',
        400
      );
    }

    // Obtenemos el owner de la tienda para verificar permisos
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

    // Si no es owner ni admin, no puede cambiar el estado
    if (!isOwner && !isAdmin) {
      return errorResponse(
        res,
        'No tienes permisos para cambiar el estado del pedido',
        'ORDER_FORBIDDEN',
        403
      );
    }

    // Actualizamos el estado del pedido
    const { data, error } = await supabaseAdmin
      .from('orders')
      .update({ status })
      .eq('id', orderId)
      .select()
      .single();

    if (error) {
      return errorResponse(res, error.message, 'ORDER_STATUS_UPDATE_ERROR', 400);
    }

    const io = getSocketServer();
    if (io) {
      io.to(`order_${orderId}`).emit('order:status_changed', {
        orderId,
        status,
        updatedAt: new Date().toISOString()
      });
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