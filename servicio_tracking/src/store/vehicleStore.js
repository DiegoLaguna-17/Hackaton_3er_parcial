const vehiculosActivos = new Map();

const PARADAS = {
  'parada_001': { nombre: 'Terminal Norte',  latitud: -16.500, longitud: -68.150 },
  'parada_002': { nombre: 'Plaza Central',   latitud: -16.495, longitud: -68.145 },
  'parada_003': { nombre: 'Mercado Central', latitud: -16.490, longitud: -68.140 },
  'parada_004': { nombre: 'Estadio',         latitud: -16.485, longitud: -68.135 },
  'parada_005': { nombre: 'Terminal Sur',    latitud: -16.480, longitud: -68.130 },
};

const _distanciaKm = (lat1, lng1, lat2, lng2) => {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const upsertVehicle = (evento) => {
  vehiculosActivos.set(evento.vehiculoId, { ...evento, actualizadoEn: new Date().toISOString() });
};

const getVehicle     = (vehiculoId) => vehiculosActivos.get(vehiculoId) || null;
const getAllVehicles  = () => Array.from(vehiculosActivos.values());

const getArrivalsAtStop = (paradaId) => {
  const parada = PARADAS[paradaId];
  if (!parada) return null;

  const VEL_PROM_KMH = { bus: 25, metro: 40, scooter: 15, default: 25 };
  const llegadas = [];

  for (const vehiculo of vehiculosActivos.values()) {
    const dist     = _distanciaKm(vehiculo.lat, vehiculo.lng, parada.latitud, parada.longitud);
    const velocidad = VEL_PROM_KMH[vehiculo.tipo] || VEL_PROM_KMH.default;
    const etaMin   = Math.round((dist / velocidad) * 60);

    if (etaMin <= 60) {
      llegadas.push({
        vehiculoId:  vehiculo.vehiculoId,
        tipo:        vehiculo.tipo,
        linea:       vehiculo.linea || 'N/A',
        distanciaKm: parseFloat(dist.toFixed(2)),
        etaMin,
        retrasado:   (vehiculo.retrasoMin || 0) > 5,
        retrasoMin:  vehiculo.retrasoMin || 0,
      });
    }
  }

  return llegadas.sort((a, b) => a.etaMin - b.etaMin);
};

const getStops = () => PARADAS;

module.exports = { upsertVehicle, getVehicle, getAllVehicles, getArrivalsAtStop, getStops };