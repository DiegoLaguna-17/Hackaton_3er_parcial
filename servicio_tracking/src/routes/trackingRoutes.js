const express = require('express');
const {
  reportarPosicion,
  obtenerTodosVehiculos,
  obtenerVehiculo,
  obtenerLlegadasParada,
} = require('../controllers/trackingController');

const router = express.Router();

router.post('/tracking/posicion',             reportarPosicion);
router.get('/tracking/vehiculos',             obtenerTodosVehiculos);
router.get('/tracking/vehiculo/:vehiculoId',  obtenerVehiculo);
router.get('/tracking/parada/:paradaId',      obtenerLlegadasParada);

module.exports = router;