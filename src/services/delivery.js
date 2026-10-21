export function haversineKm(lat1, lon1, lat2, lon2) {
  const toRad = value => (value * Math.PI) / 180;

  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function calculateDeliveryFee(shop, destLat, destLng) {
  const config = shop.delivery_config || {
    base_fee_cents: 1000,
    base_area_km: 1,
    radius_fee_cents: 2000,
    radius_km: 5,
    outside_fee_cents: null,
    max_distance_km: 10
  };

  const distanceKm = haversineKm(shop.latitude, shop.longitude, destLat, destLng);

  if (distanceKm <= config.base_area_km) {
    return config.base_fee_cents;
  }

  if (distanceKm <= config.radius_km) {
    return config.radius_fee_cents;
  }

  if (config.outside_fee_cents != null && distanceKm <= config.max_distance_km) {
    return config.outside_fee_cents;
  }

  throw new Error('Fuera del radio de entrega');
}