//src/routes/change-request.js
// Rutas para manejar solicitudes de cambio en la base de datos, como productos, tiendas y pasillos

import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';

const router = express.Router();

router.get('/change-requests', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('change_requests')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    return res.json(data);
  } catch (error) {
    console.error('GET /change-requests error:', error);
    return res.status(500).json({ message: 'Error obteniendo solicitudes' });
  }
});

router.post('/shops/:shopId/change-requests', authMiddleware, requireRole('superadmin', 'shop_admin'), async (req, res) => {
  try {
    const { shopId } = req.params;
    const { requested_changes, review_notes } = req.body;

    if (!requested_changes || typeof requested_changes !== 'object') {
      return res.status(400).json({ message: 'requested_changes es requerido' });
    }

    const { data: shop, error: shopError } = await supabaseAdmin
      .from('shops')
      .select('id, owner_id')
      .eq('id', shopId)
      .maybeSingle();

    if (shopError) {
      return res.status(400).json({ message: shopError.message });
    }

    if (!shop) {
      return res.status(404).json({ message: 'Tienda no encontrada' });
    }

    const isOwner = shop.owner_id === req.user.id;
    const isAdmin = ['superadmin', 'shop_admin'].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'No tienes permisos para crear esta solicitud' });
    }

    const { data, error } = await supabaseAdmin
      .from('change_requests')
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
      return res.status(400).json({ message: error.message });
    }

    return res.status(201).json({ change_request: data });
  } catch (error) {
    console.error('POST /shops/:shopId/change-requests error:', error);
    return res.status(500).json({ message: 'Error creando solicitud de cambio' });
  }
});

router.patch('/change-requests/:requestId/approve', authMiddleware, requireRole('superadmin', 'shop_admin'), async (req, res) => {
  try {
    const { requestId } = req.params;

    const { data: request, error: requestError } = await supabaseAdmin
      .from('change_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle();

    if (requestError) {
      return res.status(400).json({ message: requestError.message });
    }

    if (!request) {
      return res.status(404).json({ message: 'Solicitud no encontrada' });
    }

    if (request.status === 'approved') {
      return res.status(400).json({ message: 'La solicitud ya fue aprobada' });
    }

    const changes = request.requested_changes || {};

    const { data: shop, error: shopCheckError } = await supabaseAdmin
      .from('shops')
      .select('*')
      .eq('id', request.shop_id)
      .maybeSingle();

    if (shopCheckError) {
      return res.status(400).json({ message: shopCheckError.message });
    }

    if (!shop) {
      return res.status(404).json({ message: 'Tienda asociada no encontrada' });
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
        return res.status(400).json({ message: updateError.message });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('change_requests')
      .update({
        status: 'approved',
        reviewed_by: req.user.id,
        reviewed_at: new Date().toISOString()
      })
      .eq('id', requestId)
      .select()
      .single();

    if (error) {
      return res.status(400).json({ message: error.message });
    }

    return res.json({ change_request: data });
  } catch (error) {
    console.error('PATCH /change-requests/:requestId/approve error:', error);
    return res.status(500).json({ message: 'Error aprobando solicitud' });
  }
});

export default router;