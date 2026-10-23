// src/routes/change-requests.js
// Rutas para gestionar solicitudes de cambio sobre tiendas.
// Por ejemplo: cambiar la categoría, activar/desactivar una tienda,
// o pedir ajustes a partir de un cambio solicitado por un administrador.

import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';

const router = express.Router();

// GET /api/change-requests
// Devuelve todas las solicitudes de cambio registradas.
// Se usa para revisar pendientes, aprobadas o rechazadas.
router.get('/change-requests', authMiddleware, async (req, res) => {
  try {
    // Consulta todas las solicitudes de cambio de la tabla "shop_change_requests"
    const { data, error } = await supabaseAdmin
      .from('shop_change_requests')
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

// POST /api/shops/:shopId/change-requests
// Crea una solicitud para modificar una tienda.
// Ejemplo: cambiar category, description, is_active, etc.

router.post('/shops/:shopId/change-requests', authMiddleware, requireRole('superadmin', 'shop_admin'), async (req, res) => {
  try {
    const { shopId } = req.params;
    const { requested_changes, review_notes } = req.body;

    // Debe venir un objeto con los cambios solicitados
    if (!requested_changes || typeof requested_changes !== 'object') {
      return res.status(400).json({ message: 'requested_changes es requerido' });
    }

    // Validamos que la tienda exista
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

    // un admin puede crear la solicitud
    const isOwner = shop.owner_id === req.user.id;
    const isAdmin = ['superadmin', 'shop_admin'].includes(req.user.role);

    if (!isOwner && !isAdmin) {
      return res.status(403).json({ message: 'No tienes permisos para crear esta solicitud' });
    }

    // Insertamos la solicitud en la tabla correcta
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
      return res.status(400).json({ message: error.message });
    }

    return res.status(201).json({ change_request: data });
  } catch (error) {
    console.error('POST /shops/:shopId/change-requests error:', error);
    return res.status(500).json({ message: 'Error creando solicitud de cambio' });
  }
});

// PATCH /api/change-requests/:requestId/approve
// Aprueba una solicitud pendiente y aplica los cambios a la tienda.

router.patch('/change-requests/:requestId/approve', authMiddleware, requireRole('superadmin', 'shop_admin'), async (req, res) => {
  try {
    const { requestId } = req.params;

    // Buscamos la solicitud por su id
    const { data: request, error: requestError } = await supabaseAdmin
      .from('shop_change_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle();

    if (requestError) {
      return res.status(400).json({ message: requestError.message });
    }

    if (!request) {
      return res.status(404).json({ message: 'Solicitud no encontrada' });
    }

    // Si ya está aprobada, no la volvemos a aprobar
    if (request.status === 'approved') {
      return res.status(400).json({ message: 'La solicitud ya fue aprobada' });
    }

    // Leemos la tienda que va a ser actualizada
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

    // Construimos un payload con solo los valores que se van a cambiar
    const updatePayload = {};

    Object.entries(changes).forEach(([key, value]) => {
      if (value !== undefined) {
        updatePayload[key] = value;
      }
    });

    // Si hay cambios, los aplicamos a la tienda
    if (Object.keys(updatePayload).length > 0) {
      const { error: updateError } = await supabaseAdmin
        .from('shops')
        .update(updatePayload)
        .eq('id', request.shop_id);

      if (updateError) {
        return res.status(400).json({ message: updateError.message });
      }
    }

    // Marcamos la solicitud como aprobada
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
      return res.status(400).json({ message: error.message });
    }

    return res.json({ change_request: data });
  } catch (error) {
    console.error('PATCH /change-requests/:requestId/approve error:', error);
    return res.status(500).json({ message: 'Error aprobando solicitud' });
  }
});

export default router;