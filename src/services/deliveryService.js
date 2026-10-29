//src/services/deliveryService.js

import { supabaseAdmin } from '../config/supabase.js';
import crypto from 'crypto'; // IMPORTACIÓN NECESARIA para generar tokens seguros

// Servicio para registrar validaciones de entrega y tokens QR

// Esta función guarda una validación de entrega.
// Se usa cuando el conductor llega al destino y se confirma la entrega.
export const validateDelivery = async ({
  orderId,
  driverId,
  scanLocation,
  distanceToTargetMeters,
  isSuccessful,
  failReason
}) => {
  try {
    // Insertamos la validación en la tabla delivery_validations
    const { data, error } = await supabaseAdmin
      .from('delivery_validations')
      .insert([
        {
          order_id: orderId,
          driver_id: driverId,
          scan_location: scanLocation,
          distance_to_target_meters: distanceToTargetMeters || null,
          is_successful: Boolean(isSuccessful),
          fail_reason: failReason || null
        }
      ])
      .select()
      .single();

    // Si hay error, lo lanzamos para que lo capture la ruta
    if (error) throw error;

    // Devolvemos la validación creada
    return data;
  } catch (error) {
    console.error('validateDelivery error:', error);
    throw error;
  }
};

// Esta función crea un token QR asociado a una orden.
// Se genera para validar la entrega del pedido.
export const createDeliveryToken = async ({ orderId }) => {
  try {
    // CORRECCIÓN DE SEGURIDAD: Usamos crypto para que el token sea imposible de adivinar.
    const qrSecret = crypto.randomBytes(32).toString('hex');

    // Insertamos en la tabla delivery_tokens
    const { data, error } = await supabaseAdmin
      .from('delivery_tokens')
      .insert([
        {
          order_id: orderId,
          qr_secret: qrSecret
        }
      ])
      .select()
      .single();

    // Si falla, lanzamos error
    if (error) throw error;

    // Devolvemos el token creado
    return data;
  } catch (error) {
    console.error('createDeliveryToken error:', error);
    throw error;
  }
};