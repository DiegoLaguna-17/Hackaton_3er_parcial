require('dotenv').config();
const express = require('express');
const testRoutes = require('./routes/testRoutes');

const app = express();
const PORT = process.env.PORT || 3003;

app.use(express.json());

// API routes prefix handled by nginx, but internally we map /api to the routes
// Wait, NGINX: /usuarios/api -> servicio_usuarios
// If it strips the prefix, or if it doesn't? Let's just mount at /api
app.use('/api', testRoutes);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`servicio_tracking listening on port ${PORT}`);
});


const { connectProducer, sendMessage } = require('./kafka/producer');
connectProducer().then(() => {
  setInterval(() => {
    sendMessage('vehicle_positions', { vehicleId: 123, lat: 10, lng: 20, timestamp: Date.now() });
    console.log('Published to vehicle_positions');
  }, 5000);
});

