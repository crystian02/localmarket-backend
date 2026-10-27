//src/routes/ads.js

import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';

const router = express.Router();

// GET /api/ad-requests
// Consulta todas las solicitudes de anuncios/campañas.
router.get('/ad-requests', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('ad_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return errorResponse(res, error.message, 'AD_REQUESTS_FETCH_ERROR', 400);
    }

    return successResponse(res, { ads: data }, 200);
  } catch (error) {
    console.error('GET /ad-requests error:', error);
    return errorResponse(
      res,
      'Error consultando campañas',
      'AD_REQUESTS_FETCH_FAILED',
      500
    );
  }
});

// POST /api/ad-requests
// Crea una nueva solicitud de campaña para una tienda.
router.post('/ad-requests', authMiddleware, requireRole('superadmin', 'shop_admin'), async (req, res) => {
  try {
    const { shop_id, title, body, image_url, target_route, is_global } = req.body;

    if (!title || !body) {
      return errorResponse(
        res,
        'title y body son requeridos',
        'AD_REQUEST_INVALID_INPUT',
        400
      );
    }

    const { data, error } = await supabaseAdmin
      .from('ad_requests')
      .insert([
        {
          shop_id: shop_id || null,
          title,
          body,
          image_url: image_url || null,
          target_route: target_route || null,
          status: 'pending',
          send_status: 'pending',
          is_global: Boolean(is_global)
        }
      ])
      .select()
      .single();

    if (error) {
      return errorResponse(res, error.message, 'AD_REQUEST_CREATE_ERROR', 400);
    }

    return successResponse(res, { ad_request: data }, 201);
  } catch (error) {
    console.error('POST /ad-requests error:', error);
    return errorResponse(
      res,
      'Error creando campaña',
      'AD_REQUEST_CREATE_FAILED',
      500
    );
  }
});

// PATCH /api/ad-requests/:id/approve
// Aprueba una campaña pendiente.
router.patch('/ad-requests/:id/approve', authMiddleware, requireRole('superadmin', 'shop_admin'), async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabaseAdmin
      .from('ad_requests')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(),
        send_status: 'sent',
        sent_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return errorResponse(res, error.message, 'AD_REQUEST_APPROVE_ERROR', 400);
    }

    return successResponse(res, { ad_request: data }, 200);
  } catch (error) {
    console.error('PATCH /ad-requests/:id/approve error:', error);
    return errorResponse(
      res,
      'Error aprobando campaña',
      'AD_REQUEST_APPROVE_FAILED',
      500
    );
  }
});

// PATCH /api/ad-requests/:id/reject
// Rechaza una campaña pendiente.
router.patch('/ad-requests/:id/reject', authMiddleware, requireRole('superadmin', 'shop_admin'), async (req, res) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;

    const { data, error } = await supabaseAdmin
      .from('ad_requests')
      .update({
        status: 'rejected',
        rejection_reason: rejection_reason || 'Sin motivo especificado'
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return errorResponse(res, error.message, 'AD_REQUEST_REJECT_ERROR', 400);
    }

    return successResponse(res, { ad_request: data }, 200);
  } catch (error) {
    console.error('PATCH /ad-requests/:id/reject error:', error);
    return errorResponse(
      res,
      'Error rechazando campaña',
      'AD_REQUEST_REJECT_FAILED',
      500
    );
  }
});

export default router;