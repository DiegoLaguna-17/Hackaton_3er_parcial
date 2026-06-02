require('dotenv').config();
const express = require('express');
const testRoutes = require('./routes/testRoutes');

global.eventosTotales = 0;
global.eventosVehiculos = 0;
global.pagos = 0;
global.alertas = 0;

const app = express();
const PORT = process.env.PORT || 3006;

app.use(express.json());

// API routes prefix handled by nginx, but internally we map /api to the routes
// Wait, NGINX: /usuarios/api -> servicio_usuarios
// If it strips the prefix, or if it doesn't? Let's just mount at /api
app.use('/api', testRoutes);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`servicio_analitica listening on port ${PORT}`);
});


const { connectConsumer } = require('./kafka/consumer');
setTimeout(() => {
  connectConsumer(['vehicle_positions', 'payments', 'alerts'], (topic, message) => {
    global.eventosTotales++;
    if (topic === 'vehicle_positions') global.eventosVehiculos++;
    if (topic === 'payments') global.pagos++;
    if (topic === 'alerts') global.alertas++;

    console.log(`[Data Lake] procesando evento de ${topic}...`);
    console.log(`[Data Lake] guardando en data lake: ${message}`);
    console.log(`[Métricas] actualizando métricas -> Totales: ${global.eventosTotales}, Vehiculos: ${global.eventosVehiculos}, Pagos: ${global.pagos}, Alertas: ${global.alertas}`);
  });
}, 10000); // Wait for kafka

