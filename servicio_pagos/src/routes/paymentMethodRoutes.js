/**
 * UrbanFlow Technologies – Payment Method Routes
 */

const express = require('express');
const {
  registerPaymentMethod,
  getPaymentMethods,
  deactivatePaymentMethod,
  validateToken,
} = require('../controllers/paymentMethodController');
const { requireFields, validatePaymentMethodType } = require('../middleware/validators');

const router = express.Router();

// Registrar método de pago
router.post(
  '/',
  requireFields('wallet_id', 'method_type'),
  validatePaymentMethodType,
  registerPaymentMethod
);

// Listar métodos de una billetera
router.get('/:walletId', getPaymentMethods);

// Desactivar método
router.delete('/:id', deactivatePaymentMethod);

// Validar token (NFC tap, QR scan, etc.)
router.post('/validate-token', requireFields('token'), validateToken);

module.exports = router;
