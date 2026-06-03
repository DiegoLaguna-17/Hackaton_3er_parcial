const { sendMessage } = require('../kafka/producer');
const { upsertVehicle, getVehicle, getAllVehicles, getArrivalsAtStop, getStops } = require('../store/vehicleStore');
const supabase = require('../config/supabaseClient');

// POST /api/tracking/posicion
const reportarPosicion = async (req, res) => {
  try {
    const { vehiculoId, tipo, linea, lat, lng, velocidad, retrasoMin, corridorId } = req.body;

    if (!vehiculoId || lat === undefined || lng === undefined) {
      return res.status(400).json({
        error: 'Se requieren vehiculoId, lat y lng',
      });
    }

    const evento = {
      vehiculoId,
      tipo:       tipo || 'bus',
      linea:      linea || 'N/A',
      lat:        parseFloat(lat),
      lng:        parseFloat(lng),
      velocidad:  velocidad || 0,
      retrasoMin: retrasoMin || 0,
      corridorId: corridorId || 'desconocido',
      registradoEn: new Date().toISOString(),
    };

    upsertVehicle(evento);
    await sendMessage('posiciones_vehiculos', evento);

    if (supabase) {
      await supabase.from('posiciones_vehiculos').insert([{
        vehiculo_id:   evento.vehiculoId,
        tipo:          evento.tipo,
        linea:         evento.linea,
        latitud:       evento.lat,
        longitud:      evento.lng,
        velocidad:     evento.velocidad,
        retraso_min:   evento.retrasoMin,
        corredor_id:   evento.corridorId,
        registrado_en: evento.registradoEn,
      }]);
    }

    console.log(`[tracking] Posición recibida — ${vehiculoId} (${tipo}) en [${lat}, ${lng}] retraso: ${retrasoMin || 0} min`);

    return res.status(201).json({ mensaje: 'Posición registrada y publicada en Kafka', evento });
  } catch (err) {
    console.error('[tracking] Error reportando posición:', err);
    return res.status(500).json({ error: err.message });
  }
};

// GET /api/tracking/vehiculos
const obtenerTodosVehiculos = (req, res) => {
  const vehiculos = getAllVehicles();
  console.log(`[tracking] Consulta de todos los vehículos — ${vehiculos.length} activos`);
  return res.json({ total: vehiculos.length, vehiculos, actualizadoEn: new Date().toISOString() });
};

// GET /api/tracking/vehiculo/:vehiculoId
const obtenerVehiculo = (req, res) => {
  const { vehiculoId } = req.params;
  const vehiculo = getVehicle(vehiculoId);
  if (!vehiculo) return res.status(404).json({ error: `Vehículo ${vehiculoId} no encontrado` });
  console.log(`[tracking] Consulta de vehículo ${vehiculoId}`);
  return res.json({ vehiculo });
};

// GET /api/tracking/parada/:paradaId
const obtenerLlegadasParada = (req, res) => {
  const { paradaId } = req.params;
  const llegadas = getArrivalsAtStop(paradaId);
  if (llegadas === null) return res.status(404).json({ error: `Parada ${paradaId} no encontrada` });

  const paradas = getStops();
  const parada  = paradas[paradaId];

  console.log(`[tracking] Próximas llegadas a parada ${paradaId} — ${llegadas.length} vehículos`);
  return res.json({ paradaId, nombreParada: parada.nombre, llegadas, generadoEn: new Date().toISOString() });
};

module.exports = { reportarPosicion, obtenerTodosVehiculos, obtenerVehiculo, obtenerLlegadasParada };