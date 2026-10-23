//src/routes/delivery.js

import express from 'express';
import { supabaseAdmin } from '../config/supabase.js';
import { authMiddleware } from '../middleware/auth.js';
import { validateDelivery, createDeliveryToken } from '../services/deliveryService.js';

const router = express.Router();

// Rutas relacionadas con la entrega / validación del pedido


// POST /api/delivery/validate
// Valida que un conductor haya llegado al destino del pedido.
// Se usa para registrar la comprobación de la entrega.
router.post('/delivery/validate', authMiddleware, async (req, res) => {
  try {
    // Leemos los datos que vienen en el body
    const {
      order_id,
      driver_id,
      scan_location,
      distance_to_target_meters,
      is_successful,
      fail_reason
    } = req.body;

    // Validamos que los campos mínimos lleguen
    // Sin order_id, driver_id o scan_location no podemos validar la entrega
    if (!order_id || !driver_id || !scan_location) {
      return res.status(400).json({ message: 'order_id, driver_id y scan_location son requeridos' });
    }

    // Verificamos que el pedido realmente exista
    const { data: order, error: orderError } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', order_id)
      .maybeSingle();

    // Si falla la consulta, devolvemos el error
    if (orderError) return res.status(400).json({ message: orderError.message });

    // Si no existe ese pedido, respondemos 404
    if (!order) return res.status(404).json({ message: 'Pedido no encontrado' });

    // Guardamos la validación usando la función del servicio
    const validation = await validateDelivery({
      orderId: order_id,
      driverId: driver_id,
      scanLocation: scan_location,
      distanceToTargetMeters: distance_to_target_meters || null,
      isSuccessful: is_successful ?? false,
      failReason: fail_reason || null
    });

    // Devolvemos la validación creada
    return res.status(201).json({ validation });
  } catch (error) {
    // Si ocurre algo inesperado, devolvemos error 500
    console.error('POST /delivery/validate error:', error);
    return res.status(500).json({ message: 'Error validando entrega' });
  }
});

// POST /api/delivery/token
// Genera un token QR o secreto asociado al pedido para la entrega.
// Esto permite que el conductor pueda validar la entrega.
router.post('/delivery/token', authMiddleware, async (req, res) => {
  try {
    // Debemos recibir el order_id para asociar el token
    const { order_id } = req.body;

    if (!order_id) {
      return res.status(400).json({ message: 'order_id es requerido' });
    }

    // Creamos el token usando el servicio
    const token = await createDeliveryToken({ orderId: order_id });

    // Respuesta exitosa
    return res.status(201).json({ token });
  } catch (error) {
    console.error('POST /delivery/token error:', error);
    return res.status(500).json({ message: 'Error creando token de entrega' });
  }
});

// GET /api/delivery/:orderId/last-validation
// Consulta la última validación de entrega de un pedido.
// Sirve para ver si la entrega fue exitosa o no.
router.get('/delivery/:orderId/last-validation', authMiddleware, async (req, res) => {
  try {
    // Obtenemos el orderId desde la URL
    const { orderId } = req.params;

    // Buscamos la última validación asociada a ese pedido
    const { data, error } = await supabaseAdmin
      .from('delivery_validations')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Si falla la consulta
    if (error) return res.status(400).json({ message: error.message });

    // Respondemos con la validación más reciente
    return res.json({ validation: data });
  } catch (error) {
    console.error('GET /delivery/:orderId/last-validation error:', error);
    return res.status(500).json({ message: 'Error consultando validación' });
  }
});

export default router;