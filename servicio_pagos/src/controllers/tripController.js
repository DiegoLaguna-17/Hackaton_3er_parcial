/**
 * UrbanFlow Technologies – Trip Controller
 * Gestión de viajes multimodales con cobro automático
 */

const supabase = require('../config/supabaseClient');
const { calculateSegmentCost, calculateTripCost } = require('../services/pricingEngine');
const { processPayment } = require('../services/simulatedPaymentGateway');
const { sendMessage } = require('../kafka/producer');
const crypto = require('crypto');

// ── Almacén en memoria (fallback) ──
const inMemoryTrips = new Map();       // tripId → trip
const inMemorySegments = new Map();    // tripId → [segments]
const inMemoryUserTrips = new Map();   // userId → [tripIds]

/**
 * POST /api/trips/start
 * Iniciar un viaje multimodal
 */
const startTrip = async (req, res) => {
  try {
    const { user_id, payment_method_id } = req.body;

    if (supabase) {
      // Verificar que el usuario tiene billetera activa
      const { data: wallet } = await supabase
        .from('wallets')
        .select('id, balance, status')
        .eq('user_id', user_id)
        .single();

      if (!wallet || wallet.status !== 'active') {
        return res.status(400).json({
          error: 'WALLET_INACTIVE',
          message: 'El usuario no tiene una billetera activa',
        });
      }

      const { data: trip, error } = await supabase
        .from('trips')
        .insert({
          user_id,
          status: 'active',
          payment_method_id: payment_method_id || null,
          total_cost: 0,
          total_co2_saved: 0,
        })
        .select()
        .single();

      if (error) throw error;

      return res.status(201).json({
        message: 'Viaje iniciado',
        trip,
        wallet_balance: wallet.balance,
      });
    }

    // Fallback en memoria
    const trip = {
      id: crypto.randomUUID(),
      user_id,
      status: 'active',
      payment_method_id: payment_method_id || null,
      started_at: new Date().toISOString(),
      completed_at: null,
      total_cost: 0,
      total_co2_saved: 0,
    };

    inMemoryTrips.set(trip.id, trip);
    inMemorySegments.set(trip.id, []);

    if (!inMemoryUserTrips.has(user_id)) {
      inMemoryUserTrips.set(user_id, []);
    }
    inMemoryUserTrips.get(user_id).push(trip.id);

    return res.status(201).json({
      message: 'Viaje iniciado (en memoria)',
      trip,
    });

  } catch (err) {
    console.error('[TripController] Error iniciando viaje:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
};

/**
 * POST /api/trips/:tripId/add-segment
 * Agregar un tramo al viaje (bus, metro, scooter, etc.)
 */
const addSegment = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { transport_mode, origin_stop, destination_stop, distance_km, duration_minutes } = req.body;

    // Calcular costo del segmento
    const isTransfer = await checkIsTransfer(tripId, transport_mode);
    const pricing = await calculateSegmentCost(
      { transport_mode, distance_km, duration_minutes },
      isTransfer
    );

    if (supabase) {
      // Verificar que el viaje existe y está activo
      const { data: trip } = await supabase
        .from('trips')
        .select('*')
        .eq('id', tripId)
        .eq('status', 'active')
        .single();

      if (!trip) {
        return res.status(404).json({
          error: 'TRIP_NOT_FOUND',
          message: 'Viaje no encontrado o ya completado',
        });
      }

      // Contar segmentos existentes para sequence_order
      const { count } = await supabase
        .from('trip_segments')
        .select('id', { count: 'exact' })
        .eq('trip_id', tripId);

      const { data: segment, error } = await supabase
        .from('trip_segments')
        .insert({
          trip_id: tripId,
          transport_mode,
          origin_stop: origin_stop || 'N/A',
          destination_stop: destination_stop || 'N/A',
          distance_km: distance_km || 0,
          duration_minutes: duration_minutes || 0,
          segment_cost: pricing.cost,
          sequence_order: (count || 0) + 1,
        })
        .select()
        .single();

      if (error) throw error;

      // Actualizar costo total del viaje
      await supabase
        .from('trips')
        .update({
          total_cost: parseFloat(trip.total_cost) + pricing.cost,
          total_co2_saved: parseFloat(trip.total_co2_saved) + pricing.co2_saved,
        })
        .eq('id', tripId);

      return res.status(201).json({
        message: 'Segmento agregado al viaje',
        segment,
        pricing: pricing.breakdown,
        trip_running_total: parseFloat(trip.total_cost) + pricing.cost,
      });
    }

    // Fallback en memoria
    const trip = inMemoryTrips.get(tripId);
    if (!trip || trip.status !== 'active') {
      return res.status(404).json({
        error: 'TRIP_NOT_FOUND',
        message: 'Viaje no encontrado o ya completado',
      });
    }

    const segments = inMemorySegments.get(tripId) || [];
    const segment = {
      id: crypto.randomUUID(),
      trip_id: tripId,
      transport_mode,
      origin_stop: origin_stop || 'N/A',
      destination_stop: destination_stop || 'N/A',
      distance_km: distance_km || 0,
      duration_minutes: duration_minutes || 0,
      segment_cost: pricing.cost,
      sequence_order: segments.length + 1,
      started_at: new Date().toISOString(),
      completed_at: null,
    };

    segments.push(segment);
    inMemorySegments.set(tripId, segments);

    trip.total_cost += pricing.cost;
    trip.total_co2_saved += pricing.co2_saved;

    return res.status(201).json({
      message: 'Segmento agregado al viaje (en memoria)',
      segment,
      pricing: pricing.breakdown,
      trip_running_total: trip.total_cost,
    });

  } catch (err) {
    console.error('[TripController] Error agregando segmento:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
};

/**
 * POST /api/trips/:tripId/complete
 * Completar viaje y procesar cobro automático
 */
const completeTrip = async (req, res) => {
  try {
    const { tripId } = req.params;

    if (supabase) {
      // Obtener viaje con segmentos
      const { data: trip } = await supabase
        .from('trips')
        .select('*')
        .eq('id', tripId)
        .eq('status', 'active')
        .single();

      if (!trip) {
        return res.status(404).json({
          error: 'TRIP_NOT_FOUND',
          message: 'Viaje no encontrado o ya completado',
        });
      }

      const { data: segments } = await supabase
        .from('trip_segments')
        .select('*')
        .eq('trip_id', tripId)
        .order('sequence_order');

      // Obtener billetera del usuario
      const { data: wallet } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', trip.user_id)
        .single();

      if (!wallet) {
        return res.status(400).json({
          error: 'WALLET_NOT_FOUND',
          message: 'Billetera del usuario no encontrada',
        });
      }

      const totalCost = parseFloat(trip.total_cost);
      const balanceBefore = parseFloat(wallet.balance);

      // Verificar saldo suficiente
      if (balanceBefore < totalCost) {
        // Publicar evento de saldo insuficiente
        try {
          await sendMessage('payment.insufficient.funds', {
            user_id: trip.user_id,
            trip_id: tripId,
            required: totalCost,
            available: balanceBefore,
            timestamp: new Date().toISOString(),
          });
        } catch (kafkaErr) {
          console.warn('[TripController] Kafka error:', kafkaErr.message);
        }

        return res.status(402).json({
          error: 'INSUFFICIENT_FUNDS',
          message: `Saldo insuficiente. Requerido: ${totalCost} COP, Disponible: ${balanceBefore} COP`,
          required: totalCost,
          available: balanceBefore,
        });
      }

      // Procesar pago simulado
      const gatewayResult = await processPayment({
        method_type: 'mobile_app',
        token: 'SIM-TOKEN',
        amount: totalCost,
        currency: 'COP',
        description: `Viaje multimodal ${tripId}`,
      });

      if (!gatewayResult.success) {
        return res.status(402).json({
          error: 'PAYMENT_FAILED',
          message: 'El pago fue rechazado por el gateway',
          gateway_response: gatewayResult,
        });
      }

      const balanceAfter = balanceBefore - totalCost;

      // Actualizar saldo
      await supabase
        .from('wallets')
        .update({ balance: balanceAfter })
        .eq('id', wallet.id);

      // Completar viaje
      await supabase
        .from('trips')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', tripId);

      // Registrar transacción
      const { data: transaction } = await supabase
        .from('transactions')
        .insert({
          wallet_id: wallet.id,
          trip_id: tripId,
          payment_method_id: trip.payment_method_id,
          transaction_type: 'trip_charge',
          amount: totalCost,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          status: 'completed',
          description: `Viaje multimodal - ${(segments || []).length} segmentos`,
        })
        .select()
        .single();

      // Publicar evento Kafka
      try {
        await sendMessage('payment.trip.charged', {
          user_id: trip.user_id,
          trip_id: tripId,
          total_cost: totalCost,
          total_co2_saved: parseFloat(trip.total_co2_saved),
          segments_count: (segments || []).length,
          gateway_ref: gatewayResult.transaction_ref,
          balance_after: balanceAfter,
          timestamp: new Date().toISOString(),
        });
      } catch (kafkaErr) {
        console.warn('[TripController] Kafka error:', kafkaErr.message);
      }

      return res.json({
        message: 'Viaje completado y cobro procesado',
        trip: {
          id: tripId,
          status: 'completed',
          total_cost: totalCost,
          total_co2_saved: parseFloat(trip.total_co2_saved),
          segments: segments || [],
        },
        payment: {
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          transaction_id: transaction?.id,
          gateway_ref: gatewayResult.transaction_ref,
        },
      });
    }

    // Fallback en memoria
    const trip = inMemoryTrips.get(tripId);
    if (!trip || trip.status !== 'active') {
      return res.status(404).json({
        error: 'TRIP_NOT_FOUND',
        message: 'Viaje no encontrado o ya completado',
      });
    }

    const segments = inMemorySegments.get(tripId) || [];

    // Buscar billetera en memoria
    const { inMemoryWallets, inMemoryTransactions } = require('./walletController');
    const wallet = inMemoryWallets.get(trip.user_id);

    if (!wallet) {
      return res.status(400).json({
        error: 'WALLET_NOT_FOUND',
        message: 'Billetera del usuario no encontrada',
      });
    }

    const totalCost = trip.total_cost;
    const balanceBefore = wallet.balance;

    if (balanceBefore < totalCost) {
      return res.status(402).json({
        error: 'INSUFFICIENT_FUNDS',
        message: `Saldo insuficiente. Requerido: ${totalCost} COP, Disponible: ${balanceBefore} COP`,
        required: totalCost,
        available: balanceBefore,
      });
    }

    // Procesar pago simulado
    const gatewayResult = await processPayment({
      method_type: 'mobile_app',
      token: 'SIM-TOKEN',
      amount: totalCost,
      currency: 'COP',
      description: `Viaje multimodal ${tripId}`,
    });

    if (!gatewayResult.success) {
      return res.status(402).json({
        error: 'PAYMENT_FAILED',
        message: 'El pago fue rechazado por el gateway',
        gateway_response: gatewayResult,
      });
    }

    wallet.balance -= totalCost;
    wallet.updated_at = new Date().toISOString();

    trip.status = 'completed';
    trip.completed_at = new Date().toISOString();

    // Registrar transacción en memoria
    const transaction = {
      id: crypto.randomUUID(),
      wallet_id: wallet.id,
      trip_id: tripId,
      transaction_type: 'trip_charge',
      amount: totalCost,
      balance_before: balanceBefore,
      balance_after: wallet.balance,
      status: 'completed',
      description: `Viaje multimodal - ${segments.length} segmentos`,
      created_at: new Date().toISOString(),
    };

    if (!inMemoryTransactions.has(wallet.id)) {
      inMemoryTransactions.set(wallet.id, []);
    }
    inMemoryTransactions.get(wallet.id).push(transaction);

    return res.json({
      message: 'Viaje completado y cobro procesado (en memoria)',
      trip: {
        id: tripId,
        status: 'completed',
        total_cost: totalCost,
        total_co2_saved: trip.total_co2_saved,
        segments,
      },
      payment: {
        balance_before: balanceBefore,
        balance_after: wallet.balance,
        transaction_id: transaction.id,
        gateway_ref: gatewayResult.transaction_ref,
      },
    });

  } catch (err) {
    console.error('[TripController] Error completando viaje:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
};

/**
 * GET /api/trips/:tripId
 * Consultar detalles de un viaje
 */
const getTrip = async (req, res) => {
  try {
    const { tripId } = req.params;

    if (supabase) {
      const { data: trip, error } = await supabase
        .from('trips')
        .select('*')
        .eq('id', tripId)
        .single();

      if (error || !trip) {
        return res.status(404).json({ error: 'TRIP_NOT_FOUND' });
      }

      const { data: segments } = await supabase
        .from('trip_segments')
        .select('*')
        .eq('trip_id', tripId)
        .order('sequence_order');

      return res.json({ trip, segments: segments || [] });
    }

    // Fallback en memoria
    const trip = inMemoryTrips.get(tripId);
    if (!trip) {
      return res.status(404).json({ error: 'TRIP_NOT_FOUND' });
    }

    const segments = inMemorySegments.get(tripId) || [];
    return res.json({ trip, segments });

  } catch (err) {
    console.error('[TripController] Error consultando viaje:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
};

/**
 * GET /api/trips/user/:userId
 * Historial de viajes de un usuario
 */
const getUserTrips = async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    if (supabase) {
      const { data, error, count } = await supabase
        .from('trips')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('started_at', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      if (error) throw error;

      return res.json({
        user_id: userId,
        trips: data || [],
        total: count || 0,
        limit: parseInt(limit),
        offset: parseInt(offset),
      });
    }

    // Fallback en memoria
    const tripIds = inMemoryUserTrips.get(userId) || [];
    const trips = tripIds
      .map(id => inMemoryTrips.get(id))
      .filter(Boolean)
      .sort((a, b) => new Date(b.started_at) - new Date(a.started_at))
      .slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    return res.json({
      user_id: userId,
      trips,
      total: tripIds.length,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });

  } catch (err) {
    console.error('[TripController] Error consultando viajes del usuario:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
};

/**
 * POST /api/trips/estimate
 * Estimar costo de una ruta antes de iniciar viaje
 */
const estimateTripCost = async (req, res) => {
  try {
    const { segments } = req.body;

    if (!segments || !Array.isArray(segments) || segments.length === 0) {
      return res.status(400).json({
        error: 'INVALID_SEGMENTS',
        message: 'Se requiere un array de segmentos',
      });
    }

    const estimate = await calculateTripCost(segments);

    return res.json({
      message: 'Estimación de costo del viaje',
      estimate,
    });

  } catch (err) {
    console.error('[TripController] Error estimando costo:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
};

// ── Helpers ──

/**
 * Verifica si un nuevo segmento es un transbordo
 */
async function checkIsTransfer(tripId, newMode) {
  const publicModes = ['bus', 'metro'];
  if (!publicModes.includes(newMode)) return false;

  if (supabase) {
    try {
      const { data } = await supabase
        .from('trip_segments')
        .select('transport_mode')
        .eq('trip_id', tripId)
        .order('sequence_order', { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        return publicModes.includes(data[0].transport_mode);
      }
    } catch (err) {
      console.warn('[TripController] Error verificando transbordo:', err.message);
    }
    return false;
  }

  // Fallback en memoria
  const segments = inMemorySegments.get(tripId) || [];
  if (segments.length > 0) {
    const lastMode = segments[segments.length - 1].transport_mode;
    return publicModes.includes(lastMode);
  }
  return false;
}

module.exports = {
  startTrip,
  addSegment,
  completeTrip,
  getTrip,
  getUserTrips,
  estimateTripCost,
  inMemoryTrips,
  inMemorySegments,
  inMemoryUserTrips,
};
