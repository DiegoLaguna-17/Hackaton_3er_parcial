/**
 * UrbanFlow Technologies – Motor de Cálculo de Tarifas
 * 
 * Calcula el costo de cada segmento de viaje considerando:
 * - Tarifa base por modo de transporte
 * - Costo por km y por minuto (scooters, bicis)
 * - Descuento por transbordo (bus↔metro)
 * - Recargo en hora pico
 * - CO₂ ahorrado vs auto particular
 */

const supabase = require('../config/supabaseClient');
const { TARIFF_SEEDS, CO2_SAVINGS_PER_KM, isPeakHour } = require('../data/seedTariffs');

// Cache en memoria de tarifas (se refresca cada 5 min)
let tariffCache = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

/**
 * Obtiene las tarifas vigentes (DB con fallback a hardcoded)
 */
async function getTariffs() {
  const now = Date.now();
  if (tariffCache && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return tariffCache;
  }

  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('tariff_rules')
        .select('*')
        .eq('is_active', true);

      if (!error && data && data.length > 0) {
        const mapped = {};
        data.forEach(rule => { mapped[rule.transport_mode] = rule; });
        tariffCache = mapped;
        cacheTimestamp = now;
        console.log('[PricingEngine] Tarifas cargadas desde Supabase');
        return tariffCache;
      }
    }
  } catch (err) {
    console.warn('[PricingEngine] Error al cargar tarifas de DB, usando hardcoded:', err.message);
  }

  // Fallback a hardcoded
  tariffCache = { ...TARIFF_SEEDS };
  cacheTimestamp = now;
  console.log('[PricingEngine] Usando tarifas hardcodeadas');
  return tariffCache;
}

/**
 * Invalida el caché de tarifas (llamar al actualizar una tarifa)
 */
function invalidateTariffCache() {
  tariffCache = null;
  cacheTimestamp = 0;
}

/**
 * Calcula el costo de un segmento de viaje
 * 
 * @param {Object} segment - Datos del segmento
 * @param {string} segment.transport_mode - Modo de transporte
 * @param {number} segment.distance_km - Distancia en km
 * @param {number} segment.duration_minutes - Duración en minutos
 * @param {boolean} isTransfer - Si es un transbordo desde otro modo público
 * @param {Date} tripTime - Hora del viaje (para calcular hora pico)
 * @returns {Object} { cost, co2_saved, breakdown }
 */
async function calculateSegmentCost(segment, isTransfer = false, tripTime = new Date()) {
  const tariffs = await getTariffs();
  const tariff = tariffs[segment.transport_mode];

  if (!tariff) {
    return { cost: 0, co2_saved: 0, breakdown: { error: 'Tarifa no encontrada' } };
  }

  const distanceKm = parseFloat(segment.distance_km) || 0;
  const durationMin = parseInt(segment.duration_minutes) || 0;

  // 1. Cálculo base
  let baseCost = parseFloat(tariff.base_fare);
  const kmCost = parseFloat(tariff.per_km_rate) * distanceKm;
  const minuteCost = parseFloat(tariff.per_minute_rate) * durationMin;
  let subtotal = baseCost + kmCost + minuteCost;

  // 2. Descuento por transbordo
  let transferDiscount = 0;
  if (isTransfer && parseFloat(tariff.transfer_discount_pct) > 0) {
    transferDiscount = subtotal * (parseFloat(tariff.transfer_discount_pct) / 100);
    subtotal -= transferDiscount;
  }

  // 3. Recargo hora pico
  let peakSurcharge = 0;
  if (isPeakHour(tripTime) && parseFloat(tariff.peak_hour_surcharge_pct) > 0) {
    peakSurcharge = subtotal * (parseFloat(tariff.peak_hour_surcharge_pct) / 100);
    subtotal += peakSurcharge;
  }

  // 4. Redondear a 2 decimales
  const finalCost = Math.round(subtotal * 100) / 100;

  // 5. CO₂ ahorrado
  const co2Rate = CO2_SAVINGS_PER_KM[segment.transport_mode] || 0;
  const co2Saved = Math.round(co2Rate * distanceKm * 100) / 100;

  return {
    cost: finalCost,
    co2_saved: co2Saved,
    breakdown: {
      base_fare: baseCost,
      km_cost: Math.round(kmCost * 100) / 100,
      minute_cost: Math.round(minuteCost * 100) / 100,
      transfer_discount: Math.round(transferDiscount * 100) / 100,
      peak_surcharge: Math.round(peakSurcharge * 100) / 100,
      is_peak_hour: isPeakHour(tripTime),
      is_transfer: isTransfer,
      final_cost: finalCost,
    },
  };
}

/**
 * Calcula el costo total de un viaje con múltiples segmentos
 * 
 * @param {Array} segments - Array de segmentos del viaje
 * @returns {Object} { totalCost, totalCo2Saved, segmentDetails }
 */
async function calculateTripCost(segments) {
  let totalCost = 0;
  let totalCo2Saved = 0;
  const segmentDetails = [];
  const publicModes = ['bus', 'metro'];

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    // Es transbordo si el segmento anterior era transporte público y este también
    const isTransfer = i > 0 &&
      publicModes.includes(segments[i - 1].transport_mode) &&
      publicModes.includes(segment.transport_mode);

    const result = await calculateSegmentCost(segment, isTransfer);
    totalCost += result.cost;
    totalCo2Saved += result.co2_saved;
    segmentDetails.push({
      sequence: i + 1,
      transport_mode: segment.transport_mode,
      ...result,
    });
  }

  return {
    totalCost: Math.round(totalCost * 100) / 100,
    totalCo2Saved: Math.round(totalCo2Saved * 100) / 100,
    segmentDetails,
  };
}

/**
 * Estima el costo de una ruta antes de iniciar el viaje
 * (usado por el planificador de rutas)
 */
async function estimateRouteCost(routeSegments) {
  return calculateTripCost(routeSegments);
}

module.exports = {
  calculateSegmentCost,
  calculateTripCost,
  estimateRouteCost,
  getTariffs,
  invalidateTariffCache,
};
