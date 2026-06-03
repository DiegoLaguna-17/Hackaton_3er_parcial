/**
 * UrbanFlow Technologies – Wallet Controller
 * Gestión de billeteras virtuales de ciudadanos
 */

const supabase = require('../config/supabaseClient');
const { processTopup } = require('../services/simulatedPaymentGateway');
const { sendMessage } = require('../kafka/producer');
const crypto = require('crypto');

// ── Almacén en memoria (fallback si Supabase no está disponible) ──
const inMemoryWallets = new Map();
const inMemoryTransactions = new Map();

const DEFAULT_BALANCE = parseFloat(process.env.DEFAULT_BALANCE) || 50000.00;
const DEFAULT_CURRENCY = process.env.DEFAULT_CURRENCY || 'COP';

/**
 * POST /api/wallets
 * Crear una billetera para un usuario
 */
const createWallet = async (req, res) => {
  try {
    const { user_id } = req.body;

    if (supabase) {
      // Verificar si ya existe
      const { data: existing } = await supabase
        .from('wallets')
        .select('id')
        .eq('user_id', user_id)
        .single();

      if (existing) {
        return res.status(409).json({
          error: 'WALLET_EXISTS',
          message: 'Este usuario ya tiene una billetera',
          wallet_id: existing.id,
        });
      }

      const { data, error } = await supabase
        .from('wallets')
        .insert({
          user_id,
          balance: DEFAULT_BALANCE,
          currency: DEFAULT_CURRENCY,
          status: 'active',
        })
        .select()
        .single();

      if (error) throw error;

      return res.status(201).json({
        message: 'Billetera creada exitosamente',
        wallet: data,
      });
    }

    // Fallback en memoria
    if (inMemoryWallets.has(user_id)) {
      return res.status(409).json({
        error: 'WALLET_EXISTS',
        message: 'Este usuario ya tiene una billetera',
        wallet_id: inMemoryWallets.get(user_id).id,
      });
    }

    const wallet = {
      id: crypto.randomUUID(),
      user_id,
      balance: DEFAULT_BALANCE,
      currency: DEFAULT_CURRENCY,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    inMemoryWallets.set(user_id, wallet);

    return res.status(201).json({
      message: 'Billetera creada exitosamente (en memoria)',
      wallet,
    });

  } catch (err) {
    console.error('[WalletController] Error creando billetera:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
};

/**
 * GET /api/wallets/:userId
 * Consultar billetera y saldo de un usuario
 */
const getWallet = async (req, res) => {
  try {
    const { userId } = req.params;

    if (supabase) {
      const { data, error } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (error && error.code === 'PGRST116') {
        return res.status(404).json({
          error: 'WALLET_NOT_FOUND',
          message: 'No se encontró billetera para este usuario',
        });
      }
      if (error) throw error;

      return res.json({ wallet: data });
    }

    // Fallback en memoria
    const wallet = inMemoryWallets.get(userId);
    if (!wallet) {
      return res.status(404).json({
        error: 'WALLET_NOT_FOUND',
        message: 'No se encontró billetera para este usuario',
      });
    }

    return res.json({ wallet });

  } catch (err) {
    console.error('[WalletController] Error consultando billetera:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
};

/**
 * POST /api/wallets/:userId/topup
 * Recargar saldo (simulado)
 */
const topupWallet = async (req, res) => {
  try {
    const { userId } = req.params;
    const { amount, payment_method_id } = req.body;

    // Procesar recarga simulada
    const gatewayResult = await processTopup({
      amount,
      currency: DEFAULT_CURRENCY,
    });

    if (!gatewayResult.success) {
      return res.status(402).json({
        error: 'TOPUP_FAILED',
        message: 'Recarga rechazada por el gateway',
        gateway_response: gatewayResult,
      });
    }

    if (supabase) {
      // Obtener billetera actual
      const { data: wallet, error: wErr } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (wErr || !wallet) {
        return res.status(404).json({ error: 'WALLET_NOT_FOUND' });
      }

      const balanceBefore = parseFloat(wallet.balance);
      const balanceAfter = balanceBefore + amount;

      // Actualizar saldo
      const { error: updateErr } = await supabase
        .from('wallets')
        .update({ balance: balanceAfter })
        .eq('id', wallet.id);

      if (updateErr) throw updateErr;

      // Registrar transacción
      const { data: transaction } = await supabase
        .from('transactions')
        .insert({
          wallet_id: wallet.id,
          payment_method_id: payment_method_id || null,
          transaction_type: 'topup',
          amount: -amount, // Negativo = abono
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          status: 'completed',
          description: `Recarga de ${amount} ${DEFAULT_CURRENCY}`,
        })
        .select()
        .single();

      // Publicar evento Kafka
      try {
        await sendMessage('payment.topup.completed', {
          user_id: userId,
          wallet_id: wallet.id,
          amount,
          new_balance: balanceAfter,
          gateway_ref: gatewayResult.transaction_ref,
          timestamp: new Date().toISOString(),
        });
      } catch (kafkaErr) {
        console.warn('[WalletController] Error publicando evento Kafka:', kafkaErr.message);
      }

      return res.json({
        message: 'Recarga exitosa',
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        transaction,
        gateway_response: gatewayResult,
      });
    }

    // Fallback en memoria
    const wallet = inMemoryWallets.get(userId);
    if (!wallet) {
      return res.status(404).json({ error: 'WALLET_NOT_FOUND' });
    }

    const balanceBefore = wallet.balance;
    wallet.balance += amount;
    wallet.updated_at = new Date().toISOString();

    const transaction = {
      id: crypto.randomUUID(),
      wallet_id: wallet.id,
      transaction_type: 'topup',
      amount: -amount,
      balance_before: balanceBefore,
      balance_after: wallet.balance,
      status: 'completed',
      description: `Recarga de ${amount} ${DEFAULT_CURRENCY}`,
      created_at: new Date().toISOString(),
    };

    if (!inMemoryTransactions.has(wallet.id)) {
      inMemoryTransactions.set(wallet.id, []);
    }
    inMemoryTransactions.get(wallet.id).push(transaction);

    return res.json({
      message: 'Recarga exitosa (en memoria)',
      balance_before: balanceBefore,
      balance_after: wallet.balance,
      transaction,
      gateway_response: gatewayResult,
    });

  } catch (err) {
    console.error('[WalletController] Error en recarga:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
};

// Exportar también los stores en memoria para uso en otros controllers
module.exports = {
  createWallet,
  getWallet,
  topupWallet,
  inMemoryWallets,
  inMemoryTransactions,
};
