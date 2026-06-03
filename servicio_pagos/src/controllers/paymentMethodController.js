/**
 * UrbanFlow Technologies – Payment Method Controller
 * Gestión de métodos de pago: NFC, QR, App Móvil
 */

const supabase = require('../config/supabaseClient');
const { generatePaymentToken } = require('../services/simulatedPaymentGateway');
const crypto = require('crypto');

// ── Almacén en memoria (fallback) ──
const inMemoryPaymentMethods = new Map(); // walletId → [methods]

/**
 * POST /api/payment-methods
 * Registrar un nuevo método de pago
 */
const registerPaymentMethod = async (req, res) => {
  try {
    const { wallet_id, method_type, label } = req.body;

    // Generar token simulado
    const token = generatePaymentToken(method_type);

    if (supabase) {
      // Verificar que la billetera existe
      const { data: wallet, error: wErr } = await supabase
        .from('wallets')
        .select('id')
        .eq('id', wallet_id)
        .single();

      if (wErr || !wallet) {
        return res.status(404).json({
          error: 'WALLET_NOT_FOUND',
          message: 'La billetera especificada no existe',
        });
      }

      const { data, error } = await supabase
        .from('payment_methods')
        .insert({
          wallet_id,
          method_type,
          token,
          label: label || `${method_type} - ${new Date().toLocaleDateString()}`,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      return res.status(201).json({
        message: 'Método de pago registrado exitosamente',
        payment_method: data,
      });
    }

    // Fallback en memoria
    const method = {
      id: crypto.randomUUID(),
      wallet_id,
      method_type,
      token,
      label: label || `${method_type} - ${new Date().toLocaleDateString()}`,
      is_active: true,
      created_at: new Date().toISOString(),
    };

    if (!inMemoryPaymentMethods.has(wallet_id)) {
      inMemoryPaymentMethods.set(wallet_id, []);
    }
    inMemoryPaymentMethods.get(wallet_id).push(method);

    return res.status(201).json({
      message: 'Método de pago registrado exitosamente (en memoria)',
      payment_method: method,
    });

  } catch (err) {
    console.error('[PaymentMethodController] Error registrando método:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
};

/**
 * GET /api/payment-methods/:walletId
 * Listar métodos de pago de una billetera
 */
const getPaymentMethods = async (req, res) => {
  try {
    const { walletId } = req.params;

    if (supabase) {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('wallet_id', walletId)
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return res.json({
        wallet_id: walletId,
        payment_methods: data || [],
        count: (data || []).length,
      });
    }

    // Fallback en memoria
    const methods = (inMemoryPaymentMethods.get(walletId) || [])
      .filter(m => m.is_active);

    return res.json({
      wallet_id: walletId,
      payment_methods: methods,
      count: methods.length,
    });

  } catch (err) {
    console.error('[PaymentMethodController] Error listando métodos:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
};

/**
 * DELETE /api/payment-methods/:id
 * Desactivar un método de pago (soft delete)
 */
const deactivatePaymentMethod = async (req, res) => {
  try {
    const { id } = req.params;

    if (supabase) {
      const { data, error } = await supabase
        .from('payment_methods')
        .update({ is_active: false })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return res.json({
        message: 'Método de pago desactivado',
        payment_method: data,
      });
    }

    // Fallback en memoria
    for (const [walletId, methods] of inMemoryPaymentMethods) {
      const method = methods.find(m => m.id === id);
      if (method) {
        method.is_active = false;
        return res.json({
          message: 'Método de pago desactivado (en memoria)',
          payment_method: method,
        });
      }
    }

    return res.status(404).json({
      error: 'METHOD_NOT_FOUND',
      message: 'Método de pago no encontrado',
    });

  } catch (err) {
    console.error('[PaymentMethodController] Error desactivando método:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
};

/**
 * POST /api/payment-methods/validate-token
 * Validar un token de pago (NFC tap, QR scan, etc.)
 */
const validateToken = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        error: 'MISSING_TOKEN',
        message: 'Se requiere el campo token',
      });
    }

    if (supabase) {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*, wallets!inner(user_id, balance, status)')
        .eq('token', token)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        return res.status(404).json({
          error: 'INVALID_TOKEN',
          message: 'Token de pago inválido o desactivado',
          valid: false,
        });
      }

      return res.json({
        valid: true,
        payment_method: {
          id: data.id,
          method_type: data.method_type,
          wallet_id: data.wallet_id,
        },
        wallet: {
          user_id: data.wallets.user_id,
          balance: data.wallets.balance,
          status: data.wallets.status,
        },
      });
    }

    // Fallback en memoria
    for (const [walletId, methods] of inMemoryPaymentMethods) {
      const method = methods.find(m => m.token === token && m.is_active);
      if (method) {
        return res.json({
          valid: true,
          payment_method: {
            id: method.id,
            method_type: method.method_type,
            wallet_id: method.wallet_id,
          },
        });
      }
    }

    return res.status(404).json({
      error: 'INVALID_TOKEN',
      message: 'Token de pago inválido o desactivado',
      valid: false,
    });

  } catch (err) {
    console.error('[PaymentMethodController] Error validando token:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
};

module.exports = {
  registerPaymentMethod,
  getPaymentMethods,
  deactivatePaymentMethod,
  validateToken,
  inMemoryPaymentMethods,
};
