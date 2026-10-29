//src/routes/notifications.js

import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js'; // Importación añadida
import { createNotification, getNotificationsForUser } from '../services/notificationService.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';

const router = express.Router();

// GET /api/notifications
// Devuelve todas las notificaciones visibles para el usuario autenticado.
router.get('/notifications', authMiddleware, async (req, res) => {
  try {
    const notifications = await getNotificationsForUser({
      role: req.user.role
    });

    return successResponse(res, { notifications }, 200);
  } catch (error) {
    console.error('GET /notifications error:', error);
    return errorResponse(
      res,
      'Error obteniendo notificaciones',
      'NOTIFICATIONS_FETCH_FAILED',
      500
    );
  }
});

// POST /api/notifications
// Crea una nueva notificación para un rol específico o para todos.
// CORRECCIÓN DE SEGURIDAD: Solo superadmins y shop_admins pueden enviar notificaciones.
router.post('/notifications', authMiddleware, requireRole('superadmin', 'shop_admin'), async (req, res) => {
  try {
    const {
      title,
      body,
      route,
      type,
      target_role,
      target_shop_id,
      image_url
    } = req.body;

    if (!title || !body) {
      return errorResponse(
        res,
        'title y body son requeridos',
        'NOTIFICATION_INVALID_INPUT',
        400
      );
    }

    const notification = await createNotification({
      title,
      body,
      route: route || null,
      type: type || 'info',
      targetRole: target_role || 'all',
      targetShopId: target_shop_id || null,
      createdBy: req.user.id,
      imageUrl: image_url || null
    });

    return successResponse(res, { notification }, 201);
  } catch (error) {
    console.error('POST /notifications error:', error);
    return errorResponse(
      res,
      'Error creando notificación',
      'NOTIFICATION_CREATE_FAILED',
      500
    );
  }
});

export default router;