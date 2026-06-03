const supabase = require('../config/supabaseClient');

const testApi = (req, res) => {
  const puntualidad = global.eventosVehiculos > 0
    ? (((global.eventosVehiculos - global.eventosConRetraso) / global.eventosVehiculos) * 100).toFixed(1)
    : 100;

  const ocupacionPromedio = global.ocupacionCount > 0
    ? (global.ocupacionTotal / global.ocupacionCount).toFixed(1)
    : 0;

  res.json({
    service: 'analitica',
    status: 'ok',
    events_processed: global.eventosTotales,
    kpis: {
      flujo_por_corredor: global.flujoPorCorredor,
      indice_puntualidad_pct: parseFloat(puntualidad),
      co2_evitado_kg: parseFloat(global.co2Evitado.toFixed(2)),
      ocupacion_promedio_pct: parseFloat(ocupacionPromedio),
      pagos_procesados: global.pagos,
      alertas_recibidas: global.alertas
    }
  });
};

const testDb = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('wallets')        // ← tabla que ya existe
      .select('*')
      .limit(1);

    if (error) {
      return res.json({ database: 'error', error: error.message });
    }

    res.json({ database: 'connected' });
  } catch (err) {
    res.json({ database: 'error', error: err.message });
  }
};

module.exports = { testApi, testDb };
