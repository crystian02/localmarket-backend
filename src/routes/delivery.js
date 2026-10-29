//src/routes/delivery.js
import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateDelivery, createDeliveryToken } from '../services/deliveryService.js';
import { calculateDeliveryFee } from '../services/delivery.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';

const router = express.Router();

// GET /api/delivery/quote
// Calcula el costo de envío sin crear un pedido (para mostrar en el frontend)
router.get('/delivery/quote', authMiddleware, async (req, res) => {
  try {
    const { shop_id, lat, lng } = req.query;

    if (!shop_id || lat === undefined || lng === undefined) {
      return errorResponse(res, 'shop_id, lat y lng son requeridos', 'QUOTE_INVALID_INPUT', 400);
    }

    const { data: shop, error: shopError } = await supabaseAdmin
      .from('shops')
      .select('id, is_active, latitude, longitude, delivery_config')
      .eq('id', shop_id)
      .maybeSingle();

    if (shopError) return errorResponse(res, shopError.message, 'SHOP_QUERY_ERROR', 400);
    if (!shop) return errorResponse(res, 'Tienda no encontrada', 'SHOP_NOT_FOUND', 404);
    if (!shop.is_active) return errorResponse(res, 'La tienda no está activa', 'SHOP_INACTIVE', 400);

    try {
      const feeCents = calculateDeliveryFee(shop, Number(lat), Number(lng));
      return successResponse(res, { delivery_fee_cents: feeCents }, 200);
    } catch (feeError) {
      return errorResponse(res, feeError.message || 'No se pudo calcular el costo de envío', 'DELIVERY_FEE_ERROR', 400);
    }
  } catch (error) {
    console.error('GET /delivery/quote error:', error);
    return errorResponse(res, 'Error calculando cotización', 'DELIVERY_QUOTE_FAILED', 500);
  }
});

// POST /api/delivery/validate
router.post('/delivery/validate', authMiddleware, async (req, res) => {
  try {
    const {
      order_id,
      qr_secret, // CORRECCIÓN: nuevo campo requerido
      scan_location,
      distance_to_target_meters,
      is_successful,
      fail_reason
    } = req.body;

    // CORRECCIÓN: ahora también validamos qr_secret
    if (!order_id || !qr_secret || !scan_location) {
      return errorResponse(
        res,
        'order_id, qr_secret y scan_location son requeridos',
        'DELIVERY_INVALID_INPUT',
        400
      );
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders').select('*').eq('id', order_id).maybeSingle();

    if (orderError) return errorResponse(res, orderError.message, 'ORDER_QUERY_ERROR', 400);
    if (!order) return errorResponse(res, 'Pedido no encontrado', 'ORDER_NOT_FOUND', 404);

    if (order.driver_id !== req.user.id) {
      return errorResponse(res, 'No tienes permiso para validar la entrega de este pedido', 'DELIVERY_FORBIDDEN', 403);
    }

    // CORRECCIÓN: Verificar que el QR exista y pertenezca a este pedido
    const { data: tokenRow, error: tokenError } = await supabaseAdmin
      .from('delivery_tokens')
      .select('id, order_id, qr_secret')
      .eq('order_id', order_id)
      .eq('qr_secret', qr_secret)
      .maybeSingle();

    if (tokenError) return errorResponse(res, tokenError.message, 'TOKEN_QUERY_ERROR', 400);
    if (!tokenRow) {
      return errorResponse(res, 'Token QR inválido o no pertenece a este pedido', 'INVALID_QR_TOKEN', 400);
    }

    const validation = await validateDelivery({
      orderId: order_id,
      driverId: req.user.id,
      scanLocation: scan_location,
      distanceToTargetMeters: distance_to_target_meters || null,
      isSuccessful: is_successful ?? false,
      failReason: fail_reason || null
    });

    return successResponse(res, { validation }, 201);
  } catch (error) {
    console.error('POST /delivery/validate error:', error);
    return errorResponse(res, 'Error validando entrega', 'DELIVERY_VALIDATION_FAILED', 500);
  }
});

// POST /api/delivery/token
router.post('/delivery/token', authMiddleware, async (req, res) => {
  try {
    const { order_id } = req.body;

    if (!order_id) {
      return errorResponse(res, 'order_id es requerido', 'DELIVERY_TOKEN_INVALID_INPUT', 400);
    }

    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders').select('id, customer_id, driver_id').eq('id', order_id).maybeSingle();

    if (orderError) return errorResponse(res, orderError.message, 'ORDER_QUERY_ERROR', 400);
    if (!order) return errorResponse(res, 'Pedido no encontrado', 'ORDER_NOT_FOUND', 404);

    const isCustomer = order.customer_id === req.user.id;
    const isDriver = order.driver_id === req.user.id;
    const isSuperAdmin = req.user.role === 'superadmin';

    if (!isCustomer && !isDriver && !isSuperAdmin) {
      return errorResponse(res, 'No tienes permisos para generar un token para este pedido', 'DELIVERY_TOKEN_FORBIDDEN', 403);
    }

    const token = await createDeliveryToken({ orderId: order_id });
    return successResponse(res, { token }, 201);
  } catch (error) {
    console.error('POST /delivery/token error:', error);
    return errorResponse(res, 'Error creando token de entrega', 'DELIVERY_TOKEN_FAILED', 500);
  }
});

// GET /api/delivery/:orderId/last-validation
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

    if (error) return errorResponse(res, error.message, 'DELIVERY_VALIDATION_QUERY_ERROR', 400);
    return successResponse(res, { validation: data }, 200);
  } catch (error) {
    console.error('GET /delivery/:orderId/last-validation error:', error);
    return errorResponse(res, 'Error consultando validación', 'DELIVERY_VALIDATION_FETCH_FAILED', 500);
  }
});

export default router;