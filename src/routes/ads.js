//src/routes/ads.js

import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';

const router = express.Router();

// Rutas para gestionar campañas/publicidad de tiendas


// GET /api/ad-requests
// Consulta todas las solicitudes de anuncios/campañas.
// Sirve para ver campañas pendientes, aprobadas o rechazadas.

router.get('/ad-requests', authMiddleware, async (req, res) => {
  try {
    // Buscamos todas las campañas en la tabla ad_requests
    // Las ordenamos de la más reciente a la más antigua
    const { data, error } = await supabaseAdmin
      .from('ad_requests')
      .select('*')
      .order('created_at', { ascending: false });

    // Si hay un problema con la consulta, respondemos con el error de Supabase
    if (error) return res.status(400).json({ message: error.message });

    // Si todo sale bien, devolvemos la lista de campañas
    return res.json({ ads: data });
  } catch (error) {
    // Error inesperado del servidor
    console.error('GET /ad-requests error:', error);
    return res.status(500).json({ message: 'Error consultando campañas' });
  }
});

// POST /api/ad-requests
// Crea una nueva solicitud de campaña para una tienda.
// Puede ser una campaña global o asociada a una tienda específica.
router.post('/ad-requests', authMiddleware, requireRole('superadmin', 'shop_admin'), async (req, res) => {
  try {
    // Leemos los datos enviados por el cliente
    const { shop_id, title, body, image_url, target_route, is_global } = req.body;

    // Validamos que el título y cuerpo sean obligatorios
    if (!title || !body) {
      return res.status(400).json({ message: 'title y body son requeridos' });
    }

    // Insertamos la solicitud en la tabla ad_requests
    const { data, error } = await supabaseAdmin
      .from('ad_requests')
      .insert([
        {
          shop_id: shop_id || null,         // si es global, puede quedar null
          title,
          body,
          image_url: image_url || null,
          target_route: target_route || null,
          status: 'pending',               // por defecto queda pendiente
          send_status: 'pending',          // todavía no se envía
          is_global: Boolean(is_global)     // si es global o no
        }
      ])
      .select()
      .single();

    // Si falla el insert, devolvemos el error de la base de datos
    if (error) return res.status(400).json({ message: error.message });

    // Si fue creada correctamente
    return res.status(201).json({ ad_request: data });
  } catch (error) {
    console.error('POST /ad-requests error:', error);
    return res.status(500).json({ message: 'Error creando campaña' });
  }
});

// PATCH /api/ad-requests/:id/approve
// Aprueba una campaña pendiente.
// Cuando se aprueba, la campaña pasa a status approved y se marca como enviada.
router.patch('/ad-requests/:id/approve', authMiddleware, requireRole('superadmin', 'shop_admin'), async (req, res) => {
  try {
    // Obtenemos el id de la campaña desde la URL
    const { id } = req.params;

    // Actualizamos la campaña con estado approved
    const { data, error } = await supabaseAdmin
      .from('ad_requests')
      .update({
        status: 'approved',
        approved_at: new Date().toISOString(), // fecha de aprobación
        send_status: 'sent',                  // se considera enviada
        sent_at: new Date().toISOString()      // fecha de envío
      })
      .eq('id', id)
      .select()
      .single();

    // Si falla la actualización, respondemos con el error
    if (error) return res.status(400).json({ message: error.message });

    // Si se aprobó con éxito
    return res.json({ ad_request: data });
  } catch (error) {
    console.error('PATCH /ad-requests/:id/approve error:', error);
    return res.status(500).json({ message: 'Error aprobando campaña' });
  }
});

// PATCH /api/ad-requests/:id/reject
// Rechaza una campaña pendiente.
// Se registra el motivo del rechazo.
router.patch('/ad-requests/:id/reject', authMiddleware, requireRole('superadmin', 'shop_admin'), async (req, res) => {
  try {
    // Obtenemos el id
    const { id } = req.params;

    // Rechazo: leemos la razón opcional del cliente
    const { rejection_reason } = req.body;

    // Actualizamos la campaña con estado rejected
    const { data, error } = await supabaseAdmin
      .from('ad_requests')
      .update({
        status: 'rejected',
        rejection_reason: rejection_reason || 'Sin motivo especificado'
      })
      .eq('id', id)
      .select()
      .single();

    // Si falla el update, devolvemos error
    if (error) return res.status(400).json({ message: error.message });

    // Si se rechazó correctamente
    return res.json({ ad_request: data });
  } catch (error) {
    console.error('PATCH /ad-requests/:id/reject error:', error);
    return res.status(500).json({ message: 'Error rechazando campaña' });
  }
});

export default router;