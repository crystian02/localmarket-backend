//src/services/paymentService.js

import { supabaseAdmin } from '../config/supabase.js';

// Servicio para crear y actualizar pagos

// Crea un pago asociado a una orden
export const createPaymentRecord = async ({ orderId, userId, amountCents, provider = 'cash' }) => {
  try {
    const buyOrder = `LM-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const { data, error } = await supabaseAdmin
      .from('payments')
      .insert([
        {
          order_id: orderId,
          user_id: userId,
          amount_cents: amountCents,
          currency: 'CLP',
          status: 'pending',
          provider,
          buy_order: buyOrder
        }
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('createPaymentRecord error:', error);
    throw error;
  }
};

// Confirma el pago y actualiza el pedido como confirmado
export const confirmPayment = async ({ paymentId, provider = 'cash' }) => {
  try {
    // CORRECCIÓN: Solo confirmamos si el pago está 'pending'
    const { data, error } = await supabaseAdmin
      .from('payments')
      .update({
        status: 'paid',
        provider,
        updated_at: new Date().toISOString()
      })
      .eq('id', paymentId)
      .eq('status', 'pending') // Evita re-confirmar
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('El pago no está pendiente o ya fue procesado');

    const { error: orderError } = await supabaseAdmin
      .from('orders')
      .update({
        status: 'confirmed',
        updated_at: new Date().toISOString()
      })
      .eq('id', data.order_id);

    if (orderError) throw orderError;
    return data;
  } catch (error) {
    console.error('confirmPayment error:', error);
    throw error;
  }
};

// Reembolsa el pago y marca el pedido como cancelado
export const refundPayment = async ({ paymentId }) => {
  try {
    // CORRECCIÓN: Solo reembolsamos si el pago está 'paid'
    const { data, error } = await supabaseAdmin
      .from('payments')
      .update({
        status: 'refunded',
        updated_at: new Date().toISOString()
      })
      .eq('id', paymentId)
      .eq('status', 'paid')
      .select()
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('El pago no está pagado o no se puede reembolsar');

    const { error: orderError } = await supabaseAdmin
      .from('orders')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', data.order_id);

    if (orderError) throw orderError;

    // CORRECCIÓN: Devolver el stock de los productos
    const { data: orderItems, error: itemsError } = await supabaseAdmin
      .from('order_items')
      .select('product_id, quantity')
      .eq('order_id', data.order_id);

    if (!itemsError && orderItems) {
      for (const item of orderItems) {
        await supabaseAdmin.rpc('increment_stock', {
          p_product_id: item.product_id,
          p_quantity: item.quantity
        });
      }
    }

    return data;
  } catch (error) {
    console.error('refundPayment error:', error);
    throw error;
  }
};