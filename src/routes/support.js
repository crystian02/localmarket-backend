//src/routes/support.js

import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Rutas para soporte / tickets del usuario

// GET /api/support-tickets
// Lista los tickets del usuario autenticado
router.get('/support-tickets', authMiddleware, async (req, res) => {
  try {
    // Buscamos los tickets creados por este usuario
    const { data, error } = await supabaseAdmin
      .from('support_tickets')
      .select('*')
      .eq('user_id', req.user.id)
      .order('created_at', { ascending: false });

    // Si hubo un error
    if (error) return res.status(400).json({ message: error.message });

    // Devolvemos la lista
    return res.json({ tickets: data });
  } catch (error) {
    console.error('GET /support-tickets error:', error);
    return res.status(500).json({ message: 'Error consultando tickets' });
  }
});

// POST /api/support-tickets
// Crea un ticket de soporte para reportar un problema o sugerencia
router.post('/support-tickets', authMiddleware, async (req, res) => {
  try {
    // Extraemos los datos del body
    const { shop_id, type, subject, message } = req.body;

    // Validamos que los campos mínimos vengan
    if (!type || !subject || !message) {
      return res.status(400).json({ message: 'type, subject y message son requeridos' });
    }

    // Tipos permitidos
    const allowed = ['reclamo', 'sugerencia', 'bug', 'otro'];

    // Validamos que type sea uno de los permitidos
    if (!allowed.includes(type)) {
      return res.status(400).json({ message: 'Tipo inválido' });
    }

    // Insertamos el ticket en la base de datos
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

    // Si hubo un error en la inserción
    if (error) return res.status(400).json({ message: error.message });

    // Si se creó correctamente
    return res.status(201).json({ ticket: data });
  } catch (error) {
    console.error('POST /support-tickets error:', error);
    return res.status(500).json({ message: 'Error creando ticket' });
  }
});

export default router;