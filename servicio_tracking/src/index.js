require('dotenv').config();
const express = require('express');

const testRoutes     = require('./routes/testRoutes');
const trackingRoutes = require('./routes/trackingRoutes');
const { connectProducer } = require('./kafka/producer');
const { connectConsumer } = require('./kafka/consumer');

const app  = express();
const PORT = process.env.PORT || 3003;

app.use(express.json());
app.use('/api', testRoutes);
app.use('/api', trackingRoutes);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`[servicio_tracking] Escuchando en puerto ${PORT}`);
});

setTimeout(async () => {
  await connectProducer();

  await connectConsumer(['alertas'], (topic, rawMessage) => {
    try {
      const evento = JSON.parse(rawMessage);
      console.log(`[Kafka][${topic}] Alerta recibida — tipo: ${evento.tipo || 'N/A'}`);
    } catch (err) {
      console.error('[Kafka] Error procesando alerta:', err.message);
    }
  });
}, 10000);