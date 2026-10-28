const { supabaseAdmin } = require('../config/supabase');

async function getDriverProfile(userId) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

  if (error) throw error;
  return data;
}

async function updateDriverAvailability(userId, isAvailable) {
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .update({ is_available: isAvailable })
    .eq('id', userId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function getDriverOrders(userId) {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .select('*')
    .eq('driver_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

async function assignDriverToOrder(orderId, driverId) {
  const { data, error } = await supabaseAdmin
    .from('orders')
    .update({
      driver_id: driverId,
      status: 'accepted'
    })
    .eq('id', orderId)
    .select()
    .single();

  if (error) throw error;
  return data;
}

module.exports = {
  getDriverProfile,
  updateDriverAvailability,
  getDriverOrders,
  assignDriverToOrder
};