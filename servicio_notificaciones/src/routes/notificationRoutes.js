const express = require('express');
const {
  getNotifications,
  sendDirectNotification,
  simulateKafkaEvent
} = require('../controllers/notificationController');

const router = express.Router();

// Rutas del servicio de notificaciones
router.get('/notifications', getNotifications);
router.post('/notifications', sendDirectNotification);
router.post('/notifications/simulate', simulateKafkaEvent);

module.exports = router;
