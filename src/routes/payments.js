//src/routes/payments.js

import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { createPaymentRecord, confirmPayment, refundPayment } from '../services/paymentService.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';

const router = express.Router();

// GET /api/payments/:orderId
// Consulta el pago asociado a un pedido específico.
router.get('/payments/:orderId', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('payments')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle();

    if (error) {
      return errorResponse(res, error.message, 'PAYMENT_QUERY_ERROR', 400);
    }

    if (!data) {
      return errorResponse(res, 'Pago no encontrado', 'PAYMENT_NOT_FOUND', 404);
    }

    return successResponse(res, { payment: data }, 200);
  } catch (error) {
    console.error('GET /payments/:orderId error:', error);
    return errorResponse(res, 'Error obteniendo pago', 'PAYMENT_FETCH_FAILED', 500);
  }
});

// POST /api/payments/create
// Crea un registro de pago para un pedido.
router.post('/payments/create', authMiddleware, async (req, res) => {
  try {
    const { order_id } = req.body;

    if (!order_id) {
      return errorResponse(res, 'order_id es requerido', 'PAYMENT_INVALID_INPUT', 400);
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', order_id)
      .maybeSingle();

    if (orderError) {
      return errorResponse(res, orderError.message, 'ORDER_QUERY_ERROR', 400);
    }

    if (!order) {
      return errorResponse(res, 'Pedido no encontrado', 'ORDER_NOT_FOUND', 404);
    }

    if (order.customer_id !== req.user.id) {
      return errorResponse(
        res,
        'No tienes permisos sobre este pedido',
        'PAYMENT_FORBIDDEN',
        403
      );
    }

    const existingPayment = await supabaseAdmin
      .from('payments')
      .select('id')
      .eq('order_id', order_id)
      .maybeSingle();

    if (existingPayment.data) {
      return errorResponse(
        res,
        'Ya existe un pago para este pedido',
        'PAYMENT_ALREADY_EXISTS',
        409
      );
    }

    const payment = await createPaymentRecord({
      orderId: order.id,
      userId: req.user.id,
      amountCents: Number(order.total_amount_cents) + Number(order.delivery_fee_cents),
      provider: 'cash'
    });

    return successResponse(res, { payment }, 201);
  } catch (error) {
    console.error('POST /payments/create error:', error);
    return errorResponse(res, 'Error creando pago', 'PAYMENT_CREATE_FAILED', 500);
  }
});

// POST /api/payments/confirm
// Confirma el pago y actualiza el estado del pedido a "confirmed".
router.post('/payments/confirm', authMiddleware, async (req, res) => {
  try {
    const { payment_id } = req.body;

    if (!payment_id) {
      return errorResponse(res, 'payment_id es requerido', 'PAYMENT_INVALID_INPUT', 400);
    }

    const payment = await confirmPayment({ paymentId: payment_id });

    return successResponse(res, { payment }, 200);
  } catch (error) {
    console.error('POST /payments/confirm error:', error);
    return errorResponse(res, 'Error confirmando pago', 'PAYMENT_CONFIRM_FAILED', 500);
  }
});

// POST /api/payments/refund
// Reembolsa el pago y marca el pedido como cancelado.
router.post('/payments/refund', authMiddleware, async (req, res) => {
  try {
    const { payment_id } = req.body;

    if (!payment_id) {
      return errorResponse(res, 'payment_id es requerido', 'PAYMENT_INVALID_INPUT', 400);
    }

    const payment = await refundPayment({ paymentId: payment_id });

    return successResponse(res, { payment }, 200);
  } catch (error) {
    console.error('POST /payments/refund error:', error);
    return errorResponse(res, 'Error reembolsando pago', 'PAYMENT_REFUND_FAILED', 500);
  }
});

export default router;