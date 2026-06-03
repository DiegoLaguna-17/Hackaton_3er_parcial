/**
 * UrbanFlow Technologies – Gateway de Pago Simulado
 * 
 * Simula un procesador de pagos externo.
 * NINGÚN PAGO ES REAL – todo es simulado.
 * 
 * Comportamiento:
 * - 95% de las transacciones se aprueban inmediatamente
 * - 3% tienen un retraso simulado de 1-3 segundos
 * - 2% son rechazadas (para probar flujos de error)
 */

const crypto = require('crypto');

/**
 * Simula el procesamiento de un pago
 * @param {Object} paymentRequest
 * @param {string} paymentRequest.method_type - nfc_card, qr_code, mobile_app
 * @param {string} paymentRequest.token - Token del método de pago
 * @param {number} paymentRequest.amount - Monto a cobrar
 * @param {string} paymentRequest.currency - Moneda (COP)
 * @param {string} paymentRequest.description - Descripción del cobro
 * @returns {Object} Resultado del procesamiento
 */
async function processPayment(paymentRequest) {
  const transactionRef = `SIM-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;
  const startTime = Date.now();

  console.log(`[PaymentGateway] Procesando pago ${transactionRef}: ${paymentRequest.amount} ${paymentRequest.currency}`);

  // Simular latencia de red (50-200ms)
  const baseLatency = 50 + Math.random() * 150;
  await sleep(baseLatency);

  // Determinar resultado (simulado)
  const roll = Math.random() * 100;
  let result;

  if (roll < 2) {
    // 2% → Rechazo simulado
    result = {
      success: false,
      transaction_ref: transactionRef,
      status: 'declined',
      decline_reason: 'SIMULATED_DECLINE',
      message: 'Pago rechazado (simulación de error)',
      processing_time_ms: Date.now() - startTime,
      gateway: 'UrbanFlow Simulated Gateway v1.0',
      simulated: true,
    };
  } else if (roll < 5) {
    // 3% → Retraso + aprobación
    const extraDelay = 1000 + Math.random() * 2000;
    await sleep(extraDelay);
    result = {
      success: true,
      transaction_ref: transactionRef,
      status: 'approved',
      authorization_code: `AUTH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      message: 'Pago aprobado (con retraso simulado)',
      processing_time_ms: Date.now() - startTime,
      gateway: 'UrbanFlow Simulated Gateway v1.0',
      simulated: true,
    };
  } else {
    // 95% → Aprobación inmediata
    result = {
      success: true,
      transaction_ref: transactionRef,
      status: 'approved',
      authorization_code: `AUTH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      message: 'Pago aprobado exitosamente',
      processing_time_ms: Date.now() - startTime,
      gateway: 'UrbanFlow Simulated Gateway v1.0',
      simulated: true,
    };
  }

  console.log(`[PaymentGateway] Resultado ${transactionRef}: ${result.status} (${result.processing_time_ms}ms)`);
  return result;
}

/**
 * Simula una recarga de saldo
 */
async function processTopup(topupRequest) {
  const transactionRef = `TOP-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;

  await sleep(100 + Math.random() * 200);

  return {
    success: true,
    transaction_ref: transactionRef,
    status: 'approved',
    authorization_code: `AUTH-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
    message: `Recarga de ${topupRequest.amount} ${topupRequest.currency || 'COP'} aprobada`,
    processing_time_ms: 150,
    gateway: 'UrbanFlow Simulated Gateway v1.0',
    simulated: true,
  };
}

/**
 * Simula una devolución
 */
async function processRefund(refundRequest) {
  const transactionRef = `REF-${crypto.randomBytes(8).toString('hex').toUpperCase()}`;

  await sleep(200 + Math.random() * 300);

  return {
    success: true,
    transaction_ref: transactionRef,
    status: 'refunded',
    original_ref: refundRequest.original_transaction_ref,
    message: `Devolución de ${refundRequest.amount} ${refundRequest.currency || 'COP'} procesada`,
    processing_time_ms: 250,
    gateway: 'UrbanFlow Simulated Gateway v1.0',
    simulated: true,
  };
}

/**
 * Genera un token simulado para un nuevo método de pago
 */
function generatePaymentToken(methodType) {
  const prefixes = {
    nfc_card: 'NFC',
    qr_code: 'QR',
    mobile_app: 'APP',
  };
  const prefix = prefixes[methodType] || 'UNK';
  return `${prefix}-${crypto.randomBytes(12).toString('hex').toUpperCase()}`;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  processPayment,
  processTopup,
  processRefund,
  generatePaymentToken,
};
