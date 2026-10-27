//src/routes/delivery.js
import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateDelivery, createDeliveryToken } from '../services/deliveryService.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';

const router = express.Router();

// POST /api/delivery/validate
// Valida que un conductor haya llegado al destino del pedido.
router.post('/delivery/validate', authMiddleware, async (req, res) => {
  try {
    const {
      order_id,
      driver_id,
      scan_location,
      distance_to_target_meters,
      is_successful,
      fail_reason
    } = req.body;

    if (!order_id || !driver_id || !scan_location) {
      return errorResponse(
        res,
        'order_id, driver_id y scan_location son requeridos',
        'DELIVERY_INVALID_INPUT',
        400
      );
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

    const validation = await validateDelivery({
      orderId: order_id,
      driverId: driver_id,
      scanLocation: scan_location,
      distanceToTargetMeters: distance_to_target_meters || null,
      isSuccessful: is_successful ?? false,
      failReason: fail_reason || null
    });

    return successResponse(res, { validation }, 201);
  } catch (error) {
    console.error('POST /delivery/validate error:', error);
    return errorResponse(
      res,
      'Error validando entrega',
      'DELIVERY_VALIDATION_FAILED',
      500
    );
  }
});

// POST /api/delivery/token
// Genera un token QR o secreto asociado al pedido para la entrega.
router.post('/delivery/token', authMiddleware, async (req, res) => {
  try {
    const { order_id } = req.body;

    if (!order_id) {
      return errorResponse(
        res,
        'order_id es requerido',
        'DELIVERY_TOKEN_INVALID_INPUT',
        400
      );
    }

    const token = await createDeliveryToken({ orderId: order_id });

    return successResponse(res, { token }, 201);
  } catch (error) {
    console.error('POST /delivery/token error:', error);
    return errorResponse(
      res,
      'Error creando token de entrega',
      'DELIVERY_TOKEN_FAILED',
      500
    );
  }
});

// GET /api/delivery/:orderId/last-validation
// Consulta la última validación de entrega de un pedido.
router.get('/delivery/:orderId/last-validation', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.params;

    const { data, error } = await supabaseAdmin
      .from('delivery_validations')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return errorResponse(res, error.message, 'DELIVERY_VALIDATION_QUERY_ERROR', 400);
    }

    return successResponse(res, { validation: data }, 200);
  } catch (error) {
    console.error('GET /delivery/:orderId/last-validation error:', error);
    return errorResponse(
      res,
      'Error consultando validación',
      'DELIVERY_VALIDATION_FETCH_FAILED',
      500
    );
  }
});

export default router;