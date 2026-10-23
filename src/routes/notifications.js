//src/routes/notifications.js

import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { createNotification, getNotificationsForUser } from '../services/notificationService.js';

const router = express.Router();


// Rutas para consultar y crear notificaciones del sistema


// GET /api/notifications
// Devuelve todas las notificaciones visibles para el usuario autenticado.
// Se usa para mostrar el centro de notificaciones del usuario.
router.get('/notifications', authMiddleware, async (req, res) => {
  try {
    // Llamamos al servicio para obtener las notificaciones del rol del usuario
    const notifications = await getNotificationsForUser({
      role: req.user.role
    });

    // Devolvemos la lista de notificaciones
    return res.json({ notifications });
  } catch (error) {
    // Error inesperado
    console.error('GET /notifications error:', error);
    return res.status(500).json({ message: 'Error obteniendo notificaciones' });
  }
});

// POST /api/notifications
// Crea una nueva notificación para un rol específico o para todos.
// Se usa cuando se quiere avisar algo importante: nuevo pedido, cambios, promociones, etc.
router.post('/notifications', authMiddleware, async (req, res) => {
  try {
    // Leemos los datos recibidos del cliente
    const {
      title,
      body,
      route,
      type,
      target_role,
      target_shop_id,
      image_url
    } = req.body;

    // Validamos que los campos mínimos vengan
    if (!title || !body) {
      return res.status(400).json({ message: 'title y body son requeridos' });
    }

    // Creamos la notificación usando el servicio
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

    // Respuesta exitosa
    return res.status(201).json({ notification });
  } catch (error) {
    // Error general
    console.error('POST /notifications error:', error);
    return res.status(500).json({ message: 'Error creando notificación' });
  }
});

export default router;