const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const {
  getDriverProfile,
  updateDriverAvailability,
  getDriverOrders
} = require('../services/DriverService');

const router = express.Router();

router.get('/drivers/me', authMiddleware, async (req, res) => {
  try {
    const driver = await getDriverProfile(req.user.id);

    return successResponse(res, { driver }, 200);
  } catch (error) {
    return errorResponse(
      res,
      error.message || 'Error obteniendo driver',
      'DRIVER_PROFILE_ERROR',
      400
    );
  }
});

router.patch('/drivers/availability', authMiddleware, async (req, res) => {
  try {
    const { is_available } = req.body;

    if (typeof is_available !== 'boolean') {
      return errorResponse(
        res,
        'is_available debe ser boolean',
        'INVALID_DRIVER_AVAILABILITY',
        400
      );
    }

    const driver = await updateDriverAvailability(req.user.id, is_available);

    return successResponse(res, { driver }, 200);
  } catch (error) {
    return errorResponse(
      res,
      error.message || 'Error actualizando disponibilidad',
      'DRIVER_AVAILABILITY_ERROR',
      400
    );
  }
});

router.get('/drivers/orders', authMiddleware, async (req, res) => {
  try {
    const orders = await getDriverOrders(req.user.id);

    return successResponse(res, { orders }, 200);
  } catch (error) {
    return errorResponse(
      res,
      error.message || 'Error obteniendo pedidos del driver',
      'DRIVER_ORDERS_ERROR',
      400
    );
  }
});

module.exports = router;