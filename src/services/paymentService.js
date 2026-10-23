//src/services/paymentService.js

import { supabaseAdmin } from '../config/supabase.js';

// Servicio para crear y actualizar pagos

// Crea un pago asociado a una orden
export const createPaymentRecord = async ({ orderId, userId, amountCents, provider = 'cash' }) => {
  try {
    // Generamos un identificador de compra para la transacción
    const buyOrder = `LM-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    // Insertamos el pago en la tabla payments
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
    // Primero actualizamos el estado del pago a "paid"
    const { data, error } = await supabaseAdmin
      .from('payments')
      .update({
        status: 'paid',
        provider,
        updated_at: new Date().toISOString()
      })
      .eq('id', paymentId)
      .select()
      .single();

    if (error) throw error;

    // Luego actualizamos el pedido relacionado
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
    const { data, error } = await supabaseAdmin
      .from('payments')
      .update({
        status: 'refunded',
        updated_at: new Date().toISOString()
      })
      .eq('id', paymentId)
      .select()
      .single();

    if (error) throw error;

    const { error: orderError } = await supabaseAdmin
      .from('orders')
      .update({
        status: 'cancelled',
        updated_at: new Date().toISOString()
      })
      .eq('id', data.order_id);

    if (orderError) throw orderError;

    return data;
  } catch (error) {
    console.error('refundPayment error:', error);
    throw error;
  }
};