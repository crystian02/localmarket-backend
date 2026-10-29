//src/routes/drivers.js
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/requireRole.js'; // IMPORTACIÓN AÑADIDA
import { successResponse, errorResponse } from '../utils/apiResponse.js';
import {
  getDriverProfile,
  updateDriverAvailability,
  getDriverOrders
} from '../services/driverService.js';

const router = express.Router();

// CORRECCIÓN: Restringido a conductores
router.get('/drivers/me', authMiddleware, requireRole('driver'), async (req, res) => {
  try {
    const driver = await getDriverProfile(req.user.id);
    return successResponse(res, { driver }, 200);
  } catch (error) {
    // CORRECCIÓN: No exponer error.message de la BD
    return errorResponse(res, 'Error obteniendo perfil del driver', 'DRIVER_PROFILE_ERROR', 400);
  }
});

// CORRECCIÓN: Restringido a conductores
router.patch('/drivers/availability', authMiddleware, requireRole('driver'), async (req, res) => {
  try {
    const { is_available } = req.body;

    if (typeof is_available !== 'boolean') {
      return errorResponse(res, 'is_available debe ser boolean', 'INVALID_DRIVER_AVAILABILITY', 400);
    }

    const driver = await updateDriverAvailability(req.user.id, is_available);
    return successResponse(res, { driver }, 200);
  } catch (error) {
    return errorResponse(res, 'Error actualizando disponibilidad', 'DRIVER_AVAILABILITY_ERROR', 400);
  }
});

// CORRECCIÓN: Restringido a conductores
router.get('/drivers/orders', authMiddleware, requireRole('driver'), async (req, res) => {
  try {
    const orders = await getDriverOrders(req.user.id);
    return successResponse(res, { orders }, 200);
  } catch (error) {
    return errorResponse(res, 'Error obteniendo pedidos del driver', 'DRIVER_ORDERS_ERROR', 400);
  }
});

export default router;