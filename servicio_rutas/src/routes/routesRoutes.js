const express = require('express');
const {
  planificarRuta,
  obtenerModosDisponibles,
  obtenerCongestion,
  obtenerAlternativasVehiculo,
} = require('../controllers/routesController');

const router = express.Router();

router.post('/rutas/planificar',              planificarRuta);
router.get('/rutas/modos-disponibles',        obtenerModosDisponibles);
router.get('/rutas/congestion',               obtenerCongestion);
router.get('/rutas/alternativas/:vehiculoId', obtenerAlternativasVehiculo);

module.exports = router;