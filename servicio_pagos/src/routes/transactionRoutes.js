/**
 * UrbanFlow Technologies – Transaction Routes
 */

const express = require('express');
const { getTransactions, getTransactionSummary } = require('../controllers/transactionController');

const router = express.Router();

// Historial de transacciones
router.get('/:walletId', getTransactions);

// Resumen de gastos
router.get('/:walletId/summary', getTransactionSummary);

module.exports = router;
