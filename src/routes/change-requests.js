//src/routes/change-requests.js

// Rutas para gestionar solicitudes de cambio sobre tiendas.
// Por ejemplo: cambiar la categoría, activar/desactivar una tienda,
// o pedir ajustes a partir de un cambio solicitado por un administrador.

import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';

const router = express.Router();

// GET /api/change-requests
// Devuelve todas las solicitudes de cambio registradas.
router.get('/change-requests', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('shop_change_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return errorResponse(res, error.message, 'CHANGE_REQUESTS_FETCH_ERROR', 400);
    }

    return successResponse(res, data, 200);
  } catch (error) {
    console.error('GET /change-requests error:', error);
    return errorResponse(
      res,
      'Error obteniendo solicitudes',
      'CHANGE_REQUESTS_FETCH_FAILED',
      500
    );
  }
});

// POST /api/shops/:shopId/change-requests
// Crea una solicitud para modificar una tienda.
router.post('/shops/:shopId/change-requests', authMiddleware, requireRole('superadmin', 'shop_admin'), async (req, res) => {
  try {
    const { shopId } = req.params;
    const { requested_changes, review_notes } = req.body;

    if (!requested_changes || typeof requested_changes !== 'object') {
      return errorResponse(
        res,
        'requested_changes es requerido',
        'CHANGE_REQUEST_INVALID_INPUT',
        400
      );
    }

    const { data: shop, error: shopError } = await supabaseAdmin
      .from('shops')
      .select('id, owner_id')
      .eq('id', shopId)
      .maybeSingle();

    if (shopError) {
      return errorResponse(res, shopError.message, 'SHOP_QUERY_ERROR', 400);
    }

    if (!shop) {
      return errorResponse(res, 'Tienda no encontrada', 'SHOP_NOT_FOUND', 404);
    }

    const isOwner = shop.owner_id === req.user.id;
    const isAdmin = ['superadmin', 'shop_admin'].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return errorResponse(
        res,
        'No tienes permisos para crear esta solicitud',
        'CHANGE_REQUEST_FORBIDDEN',
        403
      );
    }

    const { data, error } = await supabaseAdmin
      .from('shop_change_requests')
      .insert([
        {
          shop_id: shopId,
          requested_by: req.user.id,
          requested_changes: requested_changes,
          review_notes: review_notes || null,
          status: 'pending',
          created_at: new Date().toISOString()
        }
      ])
      .select()
      .single();

    if (error) {
      return errorResponse(res, error.message, 'CHANGE_REQUEST_CREATE_ERROR', 400);
    }

    return successResponse(res, { change_request: data }, 201);
  } catch (error) {
    console.error('POST /shops/:shopId/change-requests error:', error);
    return errorResponse(
      res,
      'Error creando solicitud de cambio',
      'CHANGE_REQUEST_CREATE_FAILED',
      500
    );
  }
});

// PATCH /api/change-requests/:requestId/approve
// Aprueba una solicitud pendiente y aplica los cambios a la tienda.
router.patch('/change-requests/:requestId/approve', authMiddleware, requireRole('superadmin', 'shop_admin'), async (req, res) => {
  try {
    const { requestId } = req.params;

    const { data: request, error: requestError } = await supabaseAdmin
      .from('shop_change_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle();

    if (requestError) {
      return errorResponse(res, requestError.message, 'CHANGE_REQUEST_QUERY_ERROR', 400);
    }

    if (!request) {
      return errorResponse(res, 'Solicitud no encontrada', 'CHANGE_REQUEST_NOT_FOUND', 404);
    }

    if (request.status === 'approved') {
      return errorResponse(
        res,
        'La solicitud ya fue aprobada',
        'CHANGE_REQUEST_ALREADY_APPROVED',
        400
      );
    }

    const changes = request.requested_changes || {};

    const { data: shop, error: shopCheckError } = await supabaseAdmin
      .from('shops')
      .select('*')
      .eq('id', request.shop_id)
      .maybeSingle();

    if (shopCheckError) {
      return errorResponse(res, shopCheckError.message, 'SHOP_QUERY_ERROR', 400);
    }

    if (!shop) {
      return errorResponse(res, 'Tienda asociada no encontrada', 'SHOP_NOT_FOUND', 404);
    }

    const updatePayload = {};

    Object.entries(changes).forEach(([key, value]) => {
      if (value !== undefined) {
        updatePayload[key] = value;
      }
    });

    if (Object.keys(updatePayload).length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('shops')
        .update(updatePayload)
        .eq('id', request.shop_id);

      if (updateError) {
        return errorResponse(res, updateError.message, 'SHOP_UPDATE_ERROR', 400);
      }
    }

    const { data, error } = await supabaseAdmin
      .from('shop_change_requests')
      .update({
        status: 'approved',
        reviewed_by: req.user.id,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', requestId)
      .select()
      .single();

    if (error) {
      return errorResponse(res, error.message, 'CHANGE_REQUEST_APPROVE_ERROR', 400);
    }

    return successResponse(res, { change_request: data }, 200);
  } catch (error) {
    console.error('PATCH /change-requests/:requestId/approve error:', error);
    return errorResponse(
      res,
      'Error aprobando solicitud',
      'CHANGE_REQUEST_APPROVE_FAILED',
      500
    );
  }
});

export default router;