//src/services/driverService.js
import { supabaseAdmin } from '../config/supabase.js';

export async function getDriverProfile(userId) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle(); // CORRECCIÓN: Evita error PGRST116 de Supabase

  if (error) throw error;
  if (!data) throw new Error('Perfil de driver no encontrado'); 
  return data;
}

export async function updateDriverAvailability(userId, isAvailable) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ is_available: isAvailable })
    .eq('id', userId)
    .select()
    .maybeSingle(); // CORRECCIÓN: Consistencia con el método de búsqueda

  if (error) throw error;
  if (!data) throw new Error('Perfil de driver no encontrado');
  return data;
}

export async function getDriverOrders(userId) {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('driver_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}