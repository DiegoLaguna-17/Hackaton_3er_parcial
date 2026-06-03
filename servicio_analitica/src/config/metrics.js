/**
 * Métricas en memoria del servicio de analítica.
 * Se actualizan en tiempo real conforme llegan eventos de Kafka.
 */
const metrics = {
  eventos_totales: 0,
  eventos_vehiculos: 0,
  pagos: 0,
  alertas: 0,
  inicio: new Date().toISOString(),
};

function incrementar(tipo) {
  metrics.eventos_totales += 1;

  switch (tipo) {
    case 'vehicle_positions':
      metrics.eventos_vehiculos += 1;
      break;
    case 'payments':
      metrics.pagos += 1;
      break;
    case 'alerts':
      metrics.alertas += 1;
      break;
  }
}

function getMetrics() {
  return { ...metrics };
}

module.exports = { incrementar, getMetrics };
