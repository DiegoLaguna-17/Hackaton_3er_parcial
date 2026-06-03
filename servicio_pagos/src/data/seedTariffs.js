/**
 * UrbanFlow Technologies – Tarifas Hardcodeadas (Seed)
 * 
 * Estas tarifas se usan como fallback en memoria cuando
 * Supabase no está disponible. Reflejan los valores
 * del schema SQL seed.
 * 
 * Moneda: COP (Pesos Colombianos)
 */

const TARIFF_SEEDS = {
  bus: {
    transport_mode: 'bus',
    base_fare: 2300.00,
    per_km_rate: 0.00,
    per_minute_rate: 0.00,
    transfer_discount_pct: 25.00,
    peak_hour_surcharge_pct: 0.00,
    is_active: true,
  },
  metro: {
    transport_mode: 'metro',
    base_fare: 2800.00,
    per_km_rate: 0.00,
    per_minute_rate: 0.00,
    transfer_discount_pct: 25.00,
    peak_hour_surcharge_pct: 0.00,
    is_active: true,
  },
  scooter: {
    transport_mode: 'scooter',
    base_fare: 1500.00,
    per_km_rate: 350.00,
    per_minute_rate: 150.00,
    transfer_discount_pct: 0.00,
    peak_hour_surcharge_pct: 20.00,
    is_active: true,
  },
  bicycle: {
    transport_mode: 'bicycle',
    base_fare: 800.00,
    per_km_rate: 200.00,
    per_minute_rate: 0.00,
    transfer_discount_pct: 0.00,
    peak_hour_surcharge_pct: 0.00,
    is_active: true,
  },
  carpool: {
    transport_mode: 'carpool',
    base_fare: 3000.00,
    per_km_rate: 500.00,
    per_minute_rate: 0.00,
    transfer_discount_pct: 10.00,
    peak_hour_surcharge_pct: 15.00,
    is_active: true,
  },
  walking: {
    transport_mode: 'walking',
    base_fare: 0.00,
    per_km_rate: 0.00,
    per_minute_rate: 0.00,
    transfer_discount_pct: 0.00,
    peak_hour_surcharge_pct: 0.00,
    is_active: true,
  },
};

/**
 * CO₂ ahorrado por km según modo de transporte vs auto particular.
 * Un auto emite ~0.21 kg CO₂/km en promedio.
 * Estos valores representan cuánto se ahorra usando cada modo.
 */
const CO2_SAVINGS_PER_KM = {
  bus: 0.15,       // Bus emite ~0.06 kg/km por pasajero → ahorro 0.15
  metro: 0.19,     // Metro eléctrico → casi cero emisiones → ahorro 0.19
  scooter: 0.18,   // Scooter eléctrico → ahorro 0.18
  bicycle: 0.21,   // Cero emisiones → ahorro total 0.21
  walking: 0.21,   // Cero emisiones → ahorro total 0.21
  carpool: 0.10,   // Comparte auto → ~50% ahorro → 0.10
};

/**
 * Horas pico definidas para la ciudad.
 * Mañana: 7:00 - 9:00
 * Tarde:  17:00 - 19:00
 */
const PEAK_HOURS = {
  morning: { start: 7, end: 9 },
  evening: { start: 17, end: 19 },
};

/**
 * Verifica si la hora actual es hora pico
 */
function isPeakHour(date = new Date()) {
  const hour = date.getHours();
  return (
    (hour >= PEAK_HOURS.morning.start && hour < PEAK_HOURS.morning.end) ||
    (hour >= PEAK_HOURS.evening.start && hour < PEAK_HOURS.evening.end)
  );
}

module.exports = {
  TARIFF_SEEDS,
  CO2_SAVINGS_PER_KM,
  PEAK_HOURS,
  isPeakHour,
};
