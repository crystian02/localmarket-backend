//src/routes/support.js

import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';

const router = express.Router();

// GET /api/support-tickets
// Lista los tickets del usuario autenticado
router.get('/support-tickets', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('support_tickets')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) {
      return errorResponse(res, error.message, 'SUPPORT_TICKETS_QUERY_ERROR', 400);
    }

    return successResponse(res, { tickets: data }, 200);
  } catch (error) {
    console.error('GET /support-tickets error:', error);
    return errorResponse(res, 'Error consultando tickets', 'SUPPORT_TICKETS_FETCH_FAILED', 500);
  }
});

// POST /api/support-tickets
// Crea un ticket de soporte para reportar un problema o sugerencia
router.post('/support-tickets', authMiddleware, async (req, res) => {
  try {
    const { shop_id, type, subject, message } = req.body;

    if (!type || !subject || !message) {
      return errorResponse(
        res,
        'type, subject y message son requeridos',
        'SUPPORT_TICKET_INVALID_INPUT',
        400
      );
    }

    const allowed = ['reclamo', 'sugerencia', 'bug', 'otro'];

    if (!allowed.includes(type)) {
      return errorResponse(res, 'Tipo inválido', 'SUPPORT_TICKET_INVALID_TYPE', 400);
    }

    const { data, error } = await supabaseAdmin
      .from('support_tickets')
      .insert([
        {
          user_id: req.user.id,
          shop_id: shop_id || null,
          type,
          subject,
          message,
          status: 'pendiente'
        }
      ])
      .select()
      .single();

    if (error) {
      return errorResponse(res, error.message, 'SUPPORT_TICKET_CREATE_ERROR', 400);
    }

    return successResponse(res, { ticket: data }, 201);
  } catch (error) {
    console.error('POST /support-tickets error:', error);
    return errorResponse(res, 'Error creando ticket', 'SUPPORT_TICKET_CREATE_FAILED', 500);
  }
});

export default router;