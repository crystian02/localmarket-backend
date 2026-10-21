//src/routes/change-request.js

import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';

const router = express.Router();

router.get('/orders/my', authMiddleware, async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select(`
      *,
      order_items (*)
    `)
    .eq('customer_id', req.user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ message: error.message });
  }

  res.json(data);
});

router.post('/orders', authMiddleware, requireRole('buyer', 'shop_admin', 'superadmin'), async (req, res) => {
  const { shop_id, items, delivery_address, delivery_latitude, delivery_longitude } = req.body;

  if (!shop_id || !items || items.length === 0) {
    return res.status(400).json({ message: 'Falta shop_id o items' });
  }

  try {
    let totalAmount = 0;

    for (const item of items) {
      const { data: product, error: productError } = await supabaseAdmin
        .from('products')
        .select('*')
        .eq('id', item.product_id)
        .eq('shop_id', shop_id)
        .single();

      if (productError || !product) {
        return res.status(404).json({ message: `Producto ${item.product_id} no encontrado` });
      }

      if (product.stock < item.quantity) {
        return res.status(400).json({ message: `Stock insuficiente para ${product.name}` });
      }

      totalAmount += Number(product.price_cents) * Number(item.quantity);
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .insert([
        {
          customer_id: req.user.id,
          shop_id,
          total_amount_cents: totalAmount,
          delivery_fee_cents: 0,
          platform_fee_cents: 0,
          delivery_address,
          delivery_latitude,
          delivery_longitude,
          payment_method: 'cash',
          status: 'created'
        }
      ])
      .select()
      .single();

    if (orderError) {
      throw orderError;
    }

    for (const item of items) {
      const { data: product } = await supabaseAdmin
        .from('products')
        .select('*')
        .eq('id', item.product_id)
        .single();

      await supabaseAdmin
        .from('products')
        .update({
          stock: Number(product.stock) - Number(item.quantity)
        })
        .eq('id', item.product_id);

      await supabaseAdmin
        .from('order_items')
        .insert([
          {
            order_id: order.id,
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price_cents: Number(product.price_cents)
          }
        ]);
    }

    return res.status(201).json(order);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Error creando el pedido' });
  }
});

router.patch('/orders/:id/status', authMiddleware, requireRole('superadmin', 'shop_admin', 'picker'), async (req, res) => {
  const { status } = req.body;

  const { data, error } = await supabaseAdmin
    .from('orders')
    .update({ status })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) {
    return res.status(400).json({ message: error.message });
  }

  res.json(data);
});

export default router;