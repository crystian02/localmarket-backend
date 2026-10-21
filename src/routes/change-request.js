import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js';

const router = express.Router();

router.post('/shops/:shopId/change-requests', authMiddleware, requireRole('shop_admin', 'superadmin'), async (req, res) => {
  const { entity, entity_id, updates } = req.body;

  if (!entity || !entity_id || !updates) {
    return res.status(400).json({ message: 'Faltan entity, entity_id o updates' });
  }

  const { data, error } = await supabaseAdmin
    .from('shop_change_requests')
    .insert([
      {
        shop_id: req.params.shopId,
        requested_by: req.user.id,
        requested_changes: {
          entity,
          entity_id,
          updates
        },
        status: 'pending'
      }
    ])
    .select()
    .single();

  if (error) {
    return res.status(400).json({ message: error.message });
  }

  return res.status(201).json(data);
});

router.get('/change-requests', authMiddleware, requireRole('superadmin'), async (req, res) => {
  const { data, error } = await supabaseAdmin
    .from('shop_change_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return res.status(500).json({ message: error.message });
  }

  res.json(data);
});

router.patch('/change-requests/:id/approve', authMiddleware, requireRole('superadmin'), async (req, res) => {
  const { data: request, error: reqError } = await supabaseAdmin
    .from('shop_change_requests')
    .select('*')
    .eq('id', req.params.id)
    .single();

  if (reqError || !request) {
    return res.status(404).json({ message: 'Solicitud no encontrada' });
  }

  const { entity, entity_id, updates } = request.requested_changes;

  const tableMap = {
    products: 'products',
    shops: 'shops',
    aisles: 'aisles'
  };

  const tableName = tableMap[entity];

  if (!tableName) {
    return res.status(400).json({ message: 'Entidad no soportada' });
  }

  const { error: updateError } = await supabaseAdmin
    .from(tableName)
    .update(updates)
    .eq('id', entity_id);

  if (updateError) {
    return res.status(400).json({ message: updateError.message });
  }

  const { data, error } = await supabaseAdmin
    .from('shop_change_requests')
    .update({
      status: 'approved',
      reviewed_by: req.user.id,
      reviewed_at: new Date().toISOString()
    })
    .eq('id', req.params.id)
    .select()
    .single();

  if (error) {
    return res.status(400).json({ message: error.message });
  }

  res.json(data);
});

export default router;