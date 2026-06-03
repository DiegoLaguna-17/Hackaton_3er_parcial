const supabase = require('../config/supabaseClient');

const posicionesVehiculos    = new Map();
const prediccionesCongestion = [];

const updateVehiclePosition = (evento) => {
  posicionesVehiculos.set(evento.vehiculoId, { ...evento, recibidoEn: new Date().toISOString() });
  _recalcularCongestion();
};

const getVehiclePosition     = (vehiculoId) => posicionesVehiculos.get(vehiculoId) || null;
const getAllVehiclePositions  = () => Array.from(posicionesVehiculos.values());
const getCongestionPredictions = () => prediccionesCongestion;

const _recalcularCongestion = async () => {
  const mapaCorredor = new Map();

  for (const pos of posicionesVehiculos.values()) {
    const corredor = pos.corridorId || 'desconocido';
    if (!mapaCorredor.has(corredor)) mapaCorredor.set(corredor, []);
    mapaCorredor.get(corredor).push(pos.vehiculoId);
  }

  prediccionesCongestion.length = 0;

  for (const [corridorId, vehiculos] of mapaCorredor.entries()) {
    if (vehiculos.length >= 3) {
      const prediccion = {
        corridorId,
        nivel:             vehiculos.length >= 6 ? 'alto' : 'medio',
        cantidadVehiculos: vehiculos.length,
        predichoEn:        new Date().toISOString(),
        minutosEstimados:  30,
        resuelto:          false,
      };

      prediccionesCongestion.push(prediccion);

      if (supabase) {
        await supabase.from('eventos_congestion').insert([{
          corredor_id:        prediccion.corridorId,
          nivel:              prediccion.nivel,
          cantidad_vehiculos: prediccion.cantidadVehiculos,
          predicho_en:        prediccion.predichoEn,
          minutos_estimados:  prediccion.minutosEstimados,
          resuelto:           prediccion.resuelto,
        }]).catch((err) => console.error('[store] Error persistiendo congestión:', err.message));
      }
    }
  }
};

module.exports = { updateVehiclePosition, getVehiclePosition, getAllVehiclePositions, getCongestionPredictions };