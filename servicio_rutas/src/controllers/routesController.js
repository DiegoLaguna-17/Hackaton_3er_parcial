const { getAllVehiclePositions, getCongestionPredictions } = require('../store/vehicleStore');
const { sendMessage } = require('../kafka/producer');
const supabase = require('../config/supabaseClient');

const MODOS_TRANSPORTE = [
  { id: 'bus',      nombre: 'Bus',               co2PorKm: 0.089 },
  { id: 'metro',    nombre: 'Metro',             co2PorKm: 0.041 },
  { id: 'scooter',  nombre: 'Scooter eléctrico', co2PorKm: 0.000 },
  { id: 'caminata', nombre: 'Caminata',          co2PorKm: 0.000 },
];

const _distancia = (lat1, lng1, lat2, lng2) => {
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

const _construirOpcionesRuta = (origen, destino, distanciaKm) => {
  const velocidadKmh = { bus: 25, metro: 40, scooter: 15, caminata: 5 };
  const costoPorKm   = { bus: 0.5, metro: 0.8, scooter: 0.3, caminata: 0 };

  const combinaciones = [
    ['metro', 'caminata'],
    ['bus',   'caminata'],
    ['metro', 'scooter'],
    ['bus',   'scooter'],
    ['caminata'],
  ];

  return combinaciones.map((modos, i) => {
    const segmentos = modos.map((modo) => {
      const segmentoKm = distanciaKm / modos.length;
      const tiempoMin  = Math.round((segmentoKm / velocidadKmh[modo]) * 60);
      const costo      = parseFloat((segmentoKm * costoPorKm[modo]).toFixed(2));
      const co2        = parseFloat((segmentoKm * MODOS_TRANSPORTE.find(m => m.id === modo).co2PorKm).toFixed(4));
      return { modo, distanciaKm: parseFloat(segmentoKm.toFixed(2)), tiempoMin, costo, co2Kg: co2 };
    });

    return {
      opcionId:       `ruta_${i + 1}`,
      modos,
      segmentos,
      tiempoTotalMin: segmentos.reduce((s, seg) => s + seg.tiempoMin, 0),
      costoTotalUSD:  parseFloat(segmentos.reduce((s, seg) => s + seg.costo, 0).toFixed(2)),
      co2TotalKg:     parseFloat(segmentos.reduce((s, seg) => s + seg.co2Kg, 0).toFixed(4)),
      recomendada:    i === 0,
    };
  });
};

// POST /api/rutas/planificar
const planificarRuta = async (req, res) => {
  try {
    const { origen, destino, preferencias = {} } = req.body;

    if (!origen?.lat || !origen?.lng || !destino?.lat || !destino?.lng) {
      return res.status(400).json({ error: 'Se requieren origen y destino con lat y lng' });
    }

    const distanciaKm = _distancia(origen.lat, origen.lng, destino.lat, destino.lng);
    const opciones    = _construirOpcionesRuta(origen, destino, distanciaKm);

    if (supabase) {
      await supabase.from('consultas_rutas').insert([{
        origen_latitud:   origen.lat,
        origen_longitud:  origen.lng,
        destino_latitud:  destino.lat,
        destino_longitud: destino.lng,
        distancia_km:     parseFloat(distanciaKm.toFixed(2)),
        opciones_json:    JSON.stringify(opciones),
        consultado_en:    new Date().toISOString(),
      }]);
    }

    console.log(`[rutas] Ruta planificada: ${distanciaKm.toFixed(2)} km — ${opciones.length} opciones`);
    return res.json({ origen, destino, distanciaKm: parseFloat(distanciaKm.toFixed(2)), opciones, generadoEn: new Date().toISOString() });
  } catch (err) {
    console.error('[rutas] Error planificando ruta:', err);
    return res.status(500).json({ error: err.message });
  }
};

// GET /api/rutas/modos-disponibles
const obtenerModosDisponibles = (req, res) => {
  const vehiculosActivos = getAllVehiclePositions();
  const modos = MODOS_TRANSPORTE.map((modo) => ({
    ...modo,
    vehiculosActivos: vehiculosActivos.filter((v) => v.tipo === modo.id).length,
    disponible: true,
  }));
  return res.json({ modos, actualizadoEn: new Date().toISOString() });
};

// GET /api/rutas/congestion
const obtenerCongestion = (req, res) => {
  const predicciones = getCongestionPredictions();
  console.log(`[rutas] Consulta de congestión — ${predicciones.length} puntos detectados`);
  return res.json({ puntosCongestion: predicciones, total: predicciones.length, horizonte: '30 minutos', generadoEn: new Date().toISOString() });
};

// GET /api/rutas/alternativas/:vehiculoId
const obtenerAlternativasVehiculo = async (req, res) => {
  const { vehiculoId } = req.params;
  const bus = getAllVehiclePositions().find((v) => v.vehiculoId === vehiculoId);

  if (!bus) return res.status(404).json({ error: `Bus ${vehiculoId} no encontrado en tracking activo` });

  const alternativas = [
    {
      alternativaId:  `alt_${vehiculoId}_1`,
      descripcion:    'Desvío por corredor norte',
      tiempoExtraMin: 4,
      motivo:         'Congestión detectada en ruta original',
      paradas:        ['Parada A', 'Parada C', 'Parada D'],
      estado:         'propuesta',
    },
    {
      alternativaId:  `alt_${vehiculoId}_2`,
      descripcion:    'Desvío por corredor sur',
      tiempoExtraMin: 7,
      motivo:         'Alternativa secundaria disponible',
      paradas:        ['Parada A', 'Parada B2', 'Parada D'],
      estado:         'propuesta',
    },
  ];

  // Persistir para auditoría regulatoria (MVP 4 — 100%)
  if (supabase) {
    await supabase.from('reenrutamientos').insert(
      alternativas.map((alt) => ({
        vehiculo_id:      vehiculoId,
        alternativa_id:   alt.alternativaId,
        descripcion:      alt.descripcion,
        tiempo_extra_min: alt.tiempoExtraMin,
        motivo:           alt.motivo,
        estado:           alt.estado,
        ejecutado_en:     new Date().toISOString(),
      }))
    );
  }

  // Notificar al conductor vía Kafka
  await sendMessage('reenrutamientos', { vehiculoId, alternativas, generadoEn: new Date().toISOString() });

  console.log(`[rutas] Alternativas calculadas y persistidas para bus ${vehiculoId}`);
  return res.json({ vehiculoId, posicionActual: bus, alternativas, generadoEn: new Date().toISOString() });
};

module.exports = { planificarRuta, obtenerModosDisponibles, obtenerCongestion, obtenerAlternativasVehiculo };