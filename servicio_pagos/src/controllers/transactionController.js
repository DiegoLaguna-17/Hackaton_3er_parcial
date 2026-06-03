/**
 * UrbanFlow Technologies – Transaction Controller
 * Historial y consulta de transacciones
 */

const supabase = require('../config/supabaseClient');
const { inMemoryTransactions } = require('./walletController');

/**
 * GET /api/transactions/:walletId
 * Historial de transacciones de una billetera
 */
const getTransactions = async (req, res) => {
  try {
    const { walletId } = req.params;
    const { limit = 50, offset = 0, type } = req.query;

    if (supabase) {
      let query = supabase
        .from('transactions')
        .select('*', { count: 'exact' })
        .eq('wallet_id', walletId)
        .order('created_at', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      if (type) {
        query = query.eq('transaction_type', type);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      return res.json({
        wallet_id: walletId,
        transactions: data || [],
        total: count || 0,
        limit: parseInt(limit),
        offset: parseInt(offset),
      });
    }

    // Fallback en memoria
    let transactions = inMemoryTransactions.get(walletId) || [];

    if (type) {
      transactions = transactions.filter(t => t.transaction_type === type);
    }

    const sorted = [...transactions].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );

    const paged = sorted.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    return res.json({
      wallet_id: walletId,
      transactions: paged,
      total: sorted.length,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

  } catch (err) {
    console.error('[TransactionController] Error consultando transacciones:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
};

/**
 * GET /api/transactions/:walletId/summary
 * Resumen de gastos por modo de transporte y periodo
 */
const getTransactionSummary = async (req, res) => {
  try {
    const { walletId } = req.params;
    const { days = 30 } = req.query;

    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - parseInt(days));

    if (supabase) {
      // Obtener transacciones del periodo
      const { data: transactions, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('wallet_id', walletId)
        .gte('created_at', sinceDate.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      const summary = buildSummary(transactions || [], parseInt(days));

      // Obtener detalle por modo (trips + segments)
      const tripIds = (transactions || [])
        .filter(t => t.trip_id)
        .map(t => t.trip_id);

      let modeBreakdown = {};
      if (tripIds.length > 0) {
        const { data: segments } = await supabase
          .from('trip_segments')
          .select('transport_mode, segment_cost, distance_km')
          .in('trip_id', tripIds);

        modeBreakdown = buildModeBreakdown(segments || []);
      }

      return res.json({
        wallet_id: walletId,
        period_days: parseInt(days),
        summary,
        by_transport_mode: modeBreakdown,
      });
    }

    // Fallback en memoria
    const allTransactions = inMemoryTransactions.get(walletId) || [];
    const filtered = allTransactions.filter(
      t => new Date(t.created_at) >= sinceDate
    );

    const summary = buildSummary(filtered, parseInt(days));

    return res.json({
      wallet_id: walletId,
      period_days: parseInt(days),
      summary,
      by_transport_mode: {},
    });

  } catch (err) {
    console.error('[TransactionController] Error generando resumen:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
};

// ── Helpers ──

function buildSummary(transactions, days) {
  const charges = transactions.filter(t => t.transaction_type === 'trip_charge');
  const topups = transactions.filter(t => t.transaction_type === 'topup');
  const refunds = transactions.filter(t => t.transaction_type === 'refund');

  return {
    total_transactions: transactions.length,
    total_charges: charges.length,
    total_topups: topups.length,
    total_refunds: refunds.length,
    total_spent: charges.reduce((sum, t) => sum + parseFloat(t.amount), 0),
    total_recharged: topups.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0),
    total_refunded: refunds.reduce((sum, t) => sum + Math.abs(parseFloat(t.amount)), 0),
    avg_daily_spend: charges.length > 0
      ? charges.reduce((sum, t) => sum + parseFloat(t.amount), 0) / days
      : 0,
    period_days: days,
  };
}

function buildModeBreakdown(segments) {
  const breakdown = {};
  for (const seg of segments) {
    const mode = seg.transport_mode;
    if (!breakdown[mode]) {
      breakdown[mode] = {
        transport_mode: mode,
        total_segments: 0,
        total_cost: 0,
        total_distance_km: 0,
      };
    }
    breakdown[mode].total_segments += 1;
    breakdown[mode].total_cost += parseFloat(seg.segment_cost || 0);
    breakdown[mode].total_distance_km += parseFloat(seg.distance_km || 0);
  }
  return breakdown;
}

module.exports = {
  getTransactions,
  getTransactionSummary,
};
