/**
 * UrbanFlow Technologies – Middleware de Validación
 * Validadores de request para los endpoints del servicio de pagos.
 */

const VALID_PAYMENT_METHODS = ['nfc_card', 'qr_code', 'mobile_app'];
const VALID_TRANSPORT_MODES = ['bus', 'metro', 'scooter', 'bicycle', 'walking', 'carpool'];

/**
 * Valida que el body tenga los campos requeridos
 */
function requireFields(...fields) {
  return (req, res, next) => {
    const missing = fields.filter(f => req.body[f] === undefined || req.body[f] === null);
    if (missing.length > 0) {
      return res.status(400).json({
        error: 'MISSING_FIELDS',
        message: `Campos requeridos faltantes: ${missing.join(', ')}`,
        missing_fields: missing,
      });
    }
    next();
  };
}

/**
 * Valida formato UUID (v4)
 */
function isValidUUID(str) {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

/**
 * Valida que un parámetro de ruta sea UUID válido
 */
function validateParamUUID(paramName) {
  return (req, res, next) => {
    const value = req.params[paramName];
    if (!value || !isValidUUID(value)) {
      return res.status(400).json({
        error: 'INVALID_UUID',
        message: `El parámetro '${paramName}' debe ser un UUID válido`,
      });
    }
    next();
  };
}

/**
 * Valida que el método de pago sea válido
 */
function validatePaymentMethodType(req, res, next) {
  const { method_type } = req.body;
  if (method_type && !VALID_PAYMENT_METHODS.includes(method_type)) {
    return res.status(400).json({
      error: 'INVALID_PAYMENT_METHOD',
      message: `Método de pago inválido. Válidos: ${VALID_PAYMENT_METHODS.join(', ')}`,
    });
  }
  next();
}

/**
 * Valida que el modo de transporte sea válido
 */
function validateTransportMode(req, res, next) {
  const { transport_mode } = req.body;
  if (transport_mode && !VALID_TRANSPORT_MODES.includes(transport_mode)) {
    return res.status(400).json({
      error: 'INVALID_TRANSPORT_MODE',
      message: `Modo de transporte inválido. Válidos: ${VALID_TRANSPORT_MODES.join(', ')}`,
    });
  }
  next();
}

/**
 * Valida montos positivos
 */
function validatePositiveAmount(fieldName = 'amount') {
  return (req, res, next) => {
    const amount = parseFloat(req.body[fieldName]);
    if (isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        error: 'INVALID_AMOUNT',
        message: `El campo '${fieldName}' debe ser un número positivo`,
      });
    }
    req.body[fieldName] = amount;
    next();
  };
}

module.exports = {
  requireFields,
  isValidUUID,
  validateParamUUID,
  validatePaymentMethodType,
  validateTransportMode,
  validatePositiveAmount,
  VALID_PAYMENT_METHODS,
  VALID_TRANSPORT_MODES,
};
