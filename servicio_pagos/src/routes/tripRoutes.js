/**
 * UrbanFlow Technologies – Trip Routes
 */

const express = require('express');
const {
  startTrip,
  addSegment,
  completeTrip,
  getTrip,
  getUserTrips,
  estimateTripCost,
} = require('../controllers/tripController');
const { requireFields, validateTransportMode } = require('../middleware/validators');

const router = express.Router();

// Estimar costo de una ruta (antes de iniciar viaje)
router.post('/estimate', requireFields('segments'), estimateTripCost);

// Iniciar viaje multimodal
router.post('/start', requireFields('user_id'), startTrip);

// Agregar segmento al viaje
router.post(
  '/:tripId/add-segment',
  requireFields('transport_mode'),
  validateTransportMode,
  addSegment
);

// Completar viaje y cobrar
router.post('/:tripId/complete', completeTrip);

// Consultar viaje específico
router.get('/:tripId', getTrip);

// Historial de viajes por usuario
router.get('/user/:userId', getUserTrips);

module.exports = router;
