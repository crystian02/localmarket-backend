// src/routes/orders.js
// Este archivo controla todo lo relacionado con los pedidos.
// Permite ver los pedidos del usuario actual, crear un pedido nuevo,
// validar el stock de los productos y actualizar el estado de un pedido.

import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';

const router = express.Router();

// Estados válidos por los que puede pasar un pedido
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
      return res.status(400).json({ message: error.message });
    }

    return res.json(data);
  } catch (error) {
    console.error('GET /orders error:', error);
    return res.status(500).json({ message: 'Error obteniendo pedidos' });
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
      return res.status(400).json({ message: 'shop_id e items son requeridos' });
    }

    // Verificamos que la tienda exista
    const { data: shop, error: shopError } = await supabaseAdmin
      .from('shops')
      .select('id, is_active')
      .eq('id', shop_id)
      .maybeSingle();

    if (shopError) {
      return res.status(400).json({ message: shopError.message });
    }

    if (!shop) {
      return res.status(404).json({ message: 'Tienda no encontrada' });
    }

    // La tienda debe estar activa para recibir pedidos
    if (!shop.is_active) {
      return res.status(400).json({ message: 'La tienda no está activa' });
    }

    // Extraemos los IDs de productos del pedido
    const productIds = items.map(item => item.product_id);

    // Traemos todos los productos que vienen en el pedido
    const { data: products, error: productsError } = await supabaseAdmin
      .from('products')
      .select('*')
      .in('id', productIds);

    if (productsError) {
      return res.status(400).json({ message: productsError.message });
    }

    // Si no encuentra todos los productos, algo está mal
    if (products.length !== productIds.length) {
      return res.status(400).json({ message: 'Hay productos inválidos en el pedido' });
    }

    // Calculamos el total del pedido
    let totalAmountCents = 0;

    for (const item of items) {
      const product = products.find(p => p.id === item.product_id);

      if (!product) {
        return res.status(400).json({ message: `Producto ${item.product_id} no encontrado` });
      }

      // Validamos que el producto esté disponible y tenga suficiente stock
      if (!product.is_available || Number(product.stock) < Number(item.quantity)) {
        return res.status(400).json({ message: `Stock insuficiente para ${product.name}` });
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
      return res.status(400).json({ message: orderError.message });
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
      return res.status(400).json({ message: itemsError.message });
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
    return res.status(201).json({
      order: {
        ...order,
        total_amount_cents: totalAmountCents + deliveryFeeCents
      }
    });
  } catch (error) {
    console.error('POST /orders error:', error);
    return res.status(500).json({ message: 'Error creando pedido' });
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
      return res.status(400).json({ message: 'Estado inválido' });
    }

    // Revisamos si el pedido existe
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (orderError) {
      return res.status(400).json({ message: orderError.message });
    }

    if (!order) {
      return res.status(404).json({ message: 'Pedido no encontrado' });
    }

    // Obtenemos el owner de la tienda para verificar permisos
    const { data: shop, error: shopError } = await supabaseAdmin
      .from('shops')
      .select('owner_id')
      .eq('id', order.shop_id)
      .maybeSingle();

    if (shopError) {
      return res.status(400).json({ message: shopError.message });
    }

    const isOwner = shop && shop.owner_id === req.user.id;
    const isAdmin = ['superadmin', 'shop_admin'].includes(req.user.role);

    // Si no es owner ni admin, no puede cambiar el estado
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'No tienes permisos para cambiar el estado del pedido' });
    }

    // Actualizamos el estado del pedido
    const { data, error } = await supabaseAdmin
      .from('orders')
      .update({ status })
      .eq('id', orderId)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    return res.json({ order: data });
  } catch (error) {
    console.error('PATCH /orders/:orderId/status error:', error);
    return res.status(500).json({ message: 'Error actualizando estado del pedido' });
  }
});

export default router;