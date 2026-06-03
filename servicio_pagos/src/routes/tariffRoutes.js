/**
 * UrbanFlow Technologies – Tariff Routes
 */

const express = require('express');
const {
  getTariffs,
  getTariffByMode,
  updateTariff,
  getAuditLog,
} = require('../controllers/tariffController');

const router = express.Router();

// Consultar log de auditoría (DEBE ir antes de /:mode para no colisionar)
router.get('/audit-log', getAuditLog);

// Listar todas las tarifas vigentes
router.get('/', getTariffs);

// Consultar tarifa por modo de transporte
router.get('/:mode', getTariffByMode);

// Actualizar tarifa (con audit log)
router.put('/:mode', updateTariff);

module.exports = router;
