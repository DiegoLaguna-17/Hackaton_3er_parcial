require('dotenv').config();
const express = require('express');
const notificationRoutes = require('./routes/notificationRoutes');
const testRoutes = require('./routes/testRoutes');
const { connectProducer } = require('./kafka/producer');
const { connectConsumer } = require('./kafka/consumer');

const app = express();
const PORT = process.env.PORT || 3005;

app.use(express.json());

// Montar rutas de test y notificaciones
app.use('/api', testRoutes);
app.use('/api', notificationRoutes);

// Iniciar servidor Express
const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`[Servicio Notificaciones] Escuchando en el puerto ${PORT}`);
});

// Iniciar conexiones de Kafka
const initKafka = async () => {
  console.log('[Kafka] Esperando 10 segundos antes de conectar a Kafka...');
  await new Promise((resolve) => setTimeout(resolve, 10000));

  try {
    console.log('[Kafka] Inicializando productor...');
    await connectProducer();
    
    console.log('[Kafka] Inicializando consumidor...');
    // Nos suscribimos a 'alerts' y 'traffic-disruptions'
    await connectConsumer(['alerts', 'traffic-disruptions']);
  } catch (error) {
    console.error('[Kafka] Error durante la inicialización:', error);
  }
};

initKafka();
