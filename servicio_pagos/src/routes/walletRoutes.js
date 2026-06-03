/**
 * UrbanFlow Technologies – Wallet Routes
 */

const express = require('express');
const { createWallet, getWallet, topupWallet } = require('../controllers/walletController');
const { requireFields, validateParamUUID, validatePositiveAmount } = require('../middleware/validators');

const router = express.Router();

// Crear billetera
router.post('/', requireFields('user_id'), createWallet);

// Consultar billetera por userId
router.get('/:userId', getWallet);

// Recargar saldo
router.post(
  '/:userId/topup',
  validatePositiveAmount('amount'),
  topupWallet
);

module.exports = router;
