//src/routes/payments.js

import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { createPaymentRecord, confirmPayment, refundPayment } from '../services/paymentService.js';

const router = express.Router();

// Rutas para gestionar pagos de pedidos

// GET /api/payments/:orderId
// Consulta el pago asociado a un pedido específico.
router.get('/payments/:orderId', authMiddleware, async (req, res) => {
  try {
    // Obtenemos el ID del pedido desde la URL
    const { orderId } = req.params;

    // Buscamos el registro de pago asociado a ese pedido
    const { data, error } = await supabaseAdmin
      .from('payments')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle();

    // Si hubo un error en la consulta
    if (error) return res.status(400).json({ message: error.message });

    // Si no existe ningún pago para ese pedido
    if (!data) return res.status(404).json({ message: 'Pago no encontrado' });

    // Si todo salió bien, devolvemos el pago
    return res.json({ payment: data });
  } catch (error) {
    console.error('GET /payments/:orderId error:', error);
    return res.status(500).json({ message: 'Error obteniendo pago' });
  }
});

// POST /api/payments/create
// Crea un registro de pago para un pedido.
router.post('/payments/create', authMiddleware, async (req, res) => {
  try {
    // Leemos el order_id del body
    const { order_id } = req.body;

    // Validamos que venga el pedido
    if (!order_id) {
      return res.status(400).json({ message: 'order_id es requerido' });
    }

    // Buscamos el pedido en la base de datos
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', order_id)
      .maybeSingle();

    // Si falla la consulta
    if (orderError) return res.status(400).json({ message: orderError.message });

    // Si el pedido no existe
    if (!order) return res.status(404).json({ message: 'Pedido no encontrado' });

    // Validamos que el pedido pertenezca al usuario autenticado
    if (order.customer_id !== req.user.id) {
      return res.status(403).json({ message: 'No tienes permisos sobre este pedido' });
    }

    // Verificamos si ya existe un pago para ese pedido
    const existingPayment = await supabaseAdmin
      .from('payments')
      .select('id')
      .eq('order_id', order_id)
      .maybeSingle();

    // Si ya existe, no creamos otro
    if (existingPayment.data) {
      return res.status(409).json({ message: 'Ya existe un pago para este pedido' });
    }

    // Generamos el pago usando el servicio
    const payment = await createPaymentRecord({
      orderId: order.id,
      userId: req.user.id,
      amountCents: Number(order.total_amount_cents) + Number(order.delivery_fee_cents),
      provider: 'cash'
    });

    // Respuesta exitosa
    return res.status(201).json({ payment });
  } catch (error) {
    console.error('POST /payments/create error:', error);
    return res.status(500).json({ message: 'Error creando pago' });
  }
});

// POST /api/payments/confirm
// Confirma el pago y actualiza el estado del pedido a "confirmed".
router.post('/payments/confirm', authMiddleware, async (req, res) => {
  try {
    // Leemos el id del pago enviado por el cliente
    const { payment_id } = req.body;

    if (!payment_id) {
      return res.status(400).json({ message: 'payment_id es requerido' });
    }

    // Llamamos al servicio que actualiza el estado del pago
    const payment = await confirmPayment({ paymentId: payment_id });

    // Respuesta exitosa
    return res.json({ payment });
  } catch (error) {
    console.error('POST /payments/confirm error:', error);
    return res.status(500).json({ message: 'Error confirmando pago' });
  }
});

// POST /api/payments/refund
// Reembolsa el pago y marca el pedido como cancelado.
router.post('/payments/refund', authMiddleware, async (req, res) => {
  try {
    // Leemos el id del pago
    const { payment_id } = req.body;

    if (!payment_id) {
      return res.status(400).json({ message: 'payment_id es requerido' });
    }

    // Llamamos al servicio que reembolsa
    const payment = await refundPayment({ paymentId: payment_id });

    // Respuesta exitosa
    return res.json({ payment });
  } catch (error) {
    console.error('POST /payments/refund error:', error);
    return res.status(500).json({ message: 'Error reembolsando pago' });
  }
});

export default router;