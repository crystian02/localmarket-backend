import { supabaseAdmin } from '../config/supabase.js';

// Servicio para manejar notificaciones

// Crea una fila en la tabla notifications
export const createNotification = async ({
  title,
  body,
  route = null,
  type = 'info',
  targetRole = 'all',
  targetShopId = null,
  createdBy = null,
  imageUrl = null
}) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .insert([
        {
          title,
          body,
          route,
          type,
          target_role: targetRole,
          target_shop_id: targetShopId,
          created_by: createdBy,
          image_url: imageUrl
        }
      ])
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('createNotification error:', error);
    throw error;
  }
};

// Obtiene las notificaciones según el rol del usuario
// Por ejemplo: "all" o "shop_admin", "buyer", "superadmin"
export const getNotificationsForUser = async ({ role }) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('notifications')
      .select('*')
      // CORRECCIÓN DE SEGURIDAD: Usamos .in() en lugar de .or() con interpolación
      .in('target_role', ['all', role])
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  } catch (error) {
    console.error('getNotificationsForUser error:', error);
    throw error;
  }
};