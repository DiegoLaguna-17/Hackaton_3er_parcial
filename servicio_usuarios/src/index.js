require('dotenv').config();
const express = require('express');
const testRoutes = require('./routes/testRoutes');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// API routes prefix handled by nginx, but internally we map /api to the routes
// Wait, NGINX: /usuarios/api -> servicio_usuarios
// If it strips the prefix, or if it doesn't? Let's just mount at /api
app.use('/api', testRoutes);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`servicio_usuarios listening on port ${PORT}`);
});


const { connectProducer, sendMessage } = require('./kafka/producer');
connectProducer().then(() => {
  setInterval(() => {
    sendMessage('alerts', { message: 'Alert from usuarios', timestamp: Date.now() });
    console.log('Published to alerts');
  }, 15000);
});

