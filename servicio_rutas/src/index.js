require('dotenv').config();
const express = require('express');

const testRoutes   = require('./routes/testRoutes');
const routesRoutes = require('./routes/routesRoutes');
const { connectProducer } = require('./kafka/producer');
const { connectConsumer } = require('./kafka/consumer');
const { updateVehiclePosition } = require('./store/vehicleStore');

const app  = express();
const PORT = process.env.PORT || 3002;

app.use(express.json());
app.use('/api', testRoutes);
app.use('/api', routesRoutes);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[servicio_rutas] Escuchando en puerto ${PORT}`);
});

setTimeout(async () => {
  await connectProducer();

  await connectConsumer(['posiciones_vehiculos'], (topic, rawMessage) => {
    try {
      const evento = JSON.parse(rawMessage);
      console.log(`[Kafka][${topic}] Posición recibida — vehiculoId: ${evento.vehiculoId}`);
      updateVehiclePosition(evento);
    } catch (err) {
      console.error('[Kafka] Error procesando mensaje:', err.message);
    }
  });
}, 10000);