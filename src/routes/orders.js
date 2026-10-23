//src/routes/orders.js
// Archivo de rutas para gestionar pedidos de clientes en la aplicación. 
// Permite consultar los pedidos del usuario autenticado, crear un nuevo pedido con validación de stock y datos del cliente, y actualizar el estado del pedido por parte de administradores o personal de picking.

import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';

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

router.get('/orders', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('user_id', req.user.id)
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

router.post('/orders', authMiddleware, async (req, res) => {
  try {
    const { shop_id, delivery_address, delivery_latitude, delivery_longitude, items } = req.body;

    if (!shop_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: 'shop_id e items son requeridos' });
    }

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

    if (!shop.is_active) {
      return res.status(400).json({ message: 'La tienda no está activa' });
    }

    const productIds = items.map(item => item.product_id);
    const { data: products, error: productsError } = await supabaseAdmin
      .from('products')
      .select('*')
      .in('id', productIds);

    if (productsError) {
      return res.status(400).json({ message: productsError.message });
    }

    if (products.length !== productIds.length) {
      return res.status(400).json({ message: 'Hay productos inválidos en el pedido' });
    }

    let totalAmountCents = 0;

    for (const item of items) {
      const product = products.find(p => p.id === item.product_id);

      if (!product) {
        return res.status(400).json({ message: `Producto ${item.product_id} no encontrado` });
      }

      if (!product.is_available || Number(product.stock) < Number(item.quantity)) {
        return res.status(400).json({ message: `Stock insuficiente para ${product.name}` });
      }

      totalAmountCents += Number(product.price_cents) * Number(item.quantity);
    }

    const deliveryFeeCents = 1000;

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert([
        {
          user_id: req.user.id,
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
      return res.status(400).json({ message: itemsError.message });
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

router.patch('/orders/:orderId/status', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status } = req.body;

    if (!VALID_STATUSES.includes(status)) {
      return res.status(400).json({ message: 'Estado inválido' });
    }

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

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'No tienes permisos para cambiar el estado del pedido' });
    }

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