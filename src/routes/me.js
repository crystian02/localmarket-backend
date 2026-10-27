// src/routes/me.js
// Rutas para manejar la información del usuario autenticado

import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';

const router = express.Router();

router.get('/me', authMiddleware, async (req, res) => {
  try {
    return successResponse(res, { user: req.user }, 200);
  } catch (error) {
    console.error('GET /me error:', error);
    return errorResponse(
      res,
      'Error obteniendo usuario autenticado',
      'ME_FETCH_FAILED',
      500
    );
  }
});

export default router;