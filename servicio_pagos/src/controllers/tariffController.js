/**
 * UrbanFlow Technologies – Tariff Controller
 * Gestión de tarifas con trazabilidad para auditoría regulatoria
 */

const supabase = require('../config/supabaseClient');
const { TARIFF_SEEDS } = require('../data/seedTariffs');
const { invalidateTariffCache } = require('../services/pricingEngine');
const { sendMessage } = require('../kafka/producer');
const crypto = require('crypto');

// ── Almacén en memoria (fallback) ──
const inMemoryTariffs = new Map(
  Object.entries(TARIFF_SEEDS).map(([mode, tariff]) => [
    mode,
    { ...tariff, id: crypto.randomUUID(), effective_from: new Date().toISOString(), effective_until: null },
  ])
);
const inMemoryAuditLog = [];

/**
 * GET /api/tariffs
 * Listar todas las tarifas vigentes
 */
const getTariffs = async (req, res) => {
  try {
    if (supabase) {
      const { data, error } = await supabase
        .from('tariff_rules')
        .select('*')
        .eq('is_active', true)
        .order('transport_mode');

      if (error) throw error;

      return res.json({
        tariffs: data || [],
        count: (data || []).length,
        currency: 'COP',
      });
    }

    // Fallback en memoria
    const tariffs = Array.from(inMemoryTariffs.values());
    return res.json({
      tariffs,
      count: tariffs.length,
      currency: 'COP',
      source: 'in-memory (hardcoded)',
    });

  } catch (err) {
    console.error('[TariffController] Error listando tarifas:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
};

/**
 * GET /api/tariffs/:mode
 * Consultar tarifa por modo de transporte
 */
const getTariffByMode = async (req, res) => {
  try {
    const { mode } = req.params;

    if (supabase) {
      const { data, error } = await supabase
        .from('tariff_rules')
        .select('*')
        .eq('transport_mode', mode)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        return res.status(404).json({
          error: 'TARIFF_NOT_FOUND',
          message: `No se encontró tarifa para el modo: ${mode}`,
        });
      }

      return res.json({ tariff: data });
    }

    // Fallback en memoria
    const tariff = inMemoryTariffs.get(mode);
    if (!tariff) {
      return res.status(404).json({
        error: 'TARIFF_NOT_FOUND',
        message: `No se encontró tarifa para el modo: ${mode}`,
      });
    }

    return res.json({ tariff });

  } catch (err) {
    console.error('[TariffController] Error consultando tarifa:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
};

/**
 * PUT /api/tariffs/:mode
 * Actualizar tarifa con registro de auditoría completo
 * 
 * Body: {
 *   base_fare, per_km_rate, per_minute_rate,
 *   transfer_discount_pct, peak_hour_surcharge_pct,
 *   changed_by, reason
 * }
 */
const updateTariff = async (req, res) => {
  try {
    const { mode } = req.params;
    const {
      base_fare,
      per_km_rate,
      per_minute_rate,
      transfer_discount_pct,
      peak_hour_surcharge_pct,
      changed_by = 'admin',
      reason = 'Actualización de tarifa',
    } = req.body;

    if (supabase) {
      // Obtener valores actuales
      const { data: current, error: fetchErr } = await supabase
        .from('tariff_rules')
        .select('*')
        .eq('transport_mode', mode)
        .eq('is_active', true)
        .single();

      if (fetchErr || !current) {
        return res.status(404).json({
          error: 'TARIFF_NOT_FOUND',
          message: `No se encontró tarifa activa para el modo: ${mode}`,
        });
      }

      // Construir valores nuevos (solo los que se envían)
      const newValues = {};
      const oldValues = {};

      if (base_fare !== undefined) {
        oldValues.base_fare = current.base_fare;
        newValues.base_fare = parseFloat(base_fare);
      }
      if (per_km_rate !== undefined) {
        oldValues.per_km_rate = current.per_km_rate;
        newValues.per_km_rate = parseFloat(per_km_rate);
      }
      if (per_minute_rate !== undefined) {
        oldValues.per_minute_rate = current.per_minute_rate;
        newValues.per_minute_rate = parseFloat(per_minute_rate);
      }
      if (transfer_discount_pct !== undefined) {
        oldValues.transfer_discount_pct = current.transfer_discount_pct;
        newValues.transfer_discount_pct = parseFloat(transfer_discount_pct);
      }
      if (peak_hour_surcharge_pct !== undefined) {
        oldValues.peak_hour_surcharge_pct = current.peak_hour_surcharge_pct;
        newValues.peak_hour_surcharge_pct = parseFloat(peak_hour_surcharge_pct);
      }

      if (Object.keys(newValues).length === 0) {
        return res.status(400).json({
          error: 'NO_CHANGES',
          message: 'No se proporcionaron campos para actualizar',
        });
      }

      // Actualizar tarifa
      const { data: updated, error: updateErr } = await supabase
        .from('tariff_rules')
        .update(newValues)
        .eq('id', current.id)
        .select()
        .single();

      if (updateErr) throw updateErr;

      // Registrar en audit log (trazabilidad regulatoria)
      const { data: auditEntry, error: auditErr } = await supabase
        .from('tariff_audit_log')
        .insert({
          tariff_rule_id: current.id,
          action: 'updated',
          old_values: oldValues,
          new_values: newValues,
          changed_by,
          reason,
        })
        .select()
        .single();

      if (auditErr) {
        console.warn('[TariffController] Error registrando auditoría:', auditErr.message);
      }

      // Invalidar caché del motor de tarifas
      invalidateTariffCache();

      // Publicar evento Kafka
      try {
        await sendMessage('payment.tariff.changed', {
          transport_mode: mode,
          old_values: oldValues,
          new_values: newValues,
          changed_by,
          reason,
          audit_id: auditEntry?.id,
          timestamp: new Date().toISOString(),
        });
      } catch (kafkaErr) {
        console.warn('[TariffController] Kafka error:', kafkaErr.message);
      }

      return res.json({
        message: 'Tarifa actualizada con trazabilidad completa',
        tariff: updated,
        audit: {
          id: auditEntry?.id,
          old_values: oldValues,
          new_values: newValues,
          changed_by,
          reason,
        },
      });
    }

    // Fallback en memoria
    const current = inMemoryTariffs.get(mode);
    if (!current) {
      return res.status(404).json({
        error: 'TARIFF_NOT_FOUND',
        message: `No se encontró tarifa para el modo: ${mode}`,
      });
    }

    const oldValues = { ...current };
    const newValues = {};

    if (base_fare !== undefined) { newValues.base_fare = parseFloat(base_fare); current.base_fare = parseFloat(base_fare); }
    if (per_km_rate !== undefined) { newValues.per_km_rate = parseFloat(per_km_rate); current.per_km_rate = parseFloat(per_km_rate); }
    if (per_minute_rate !== undefined) { newValues.per_minute_rate = parseFloat(per_minute_rate); current.per_minute_rate = parseFloat(per_minute_rate); }
    if (transfer_discount_pct !== undefined) { newValues.transfer_discount_pct = parseFloat(transfer_discount_pct); current.transfer_discount_pct = parseFloat(transfer_discount_pct); }
    if (peak_hour_surcharge_pct !== undefined) { newValues.peak_hour_surcharge_pct = parseFloat(peak_hour_surcharge_pct); current.peak_hour_surcharge_pct = parseFloat(peak_hour_surcharge_pct); }

    const auditEntry = {
      id: crypto.randomUUID(),
      tariff_rule_id: current.id,
      action: 'updated',
      old_values: oldValues,
      new_values: newValues,
      changed_by: changed_by || 'admin',
      reason: reason || 'Actualización de tarifa',
      created_at: new Date().toISOString(),
    };

    inMemoryAuditLog.push(auditEntry);
    invalidateTariffCache();

    return res.json({
      message: 'Tarifa actualizada con trazabilidad (en memoria)',
      tariff: current,
      audit: auditEntry,
    });

  } catch (err) {
    console.error('[TariffController] Error actualizando tarifa:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
};

/**
 * GET /api/tariffs/audit-log
 * Consultar log de auditoría de cambios de tarifas
 */
const getAuditLog = async (req, res) => {
  try {
    const { limit = 100, offset = 0, transport_mode } = req.query;

    if (supabase) {
      let query = supabase
        .from('tariff_audit_log')
        .select('*, tariff_rules!inner(transport_mode)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

      if (transport_mode) {
        query = query.eq('tariff_rules.transport_mode', transport_mode);
      }

      const { data, error, count } = await query;

      if (error) throw error;

      return res.json({
        audit_log: data || [],
        total: count || 0,
        limit: parseInt(limit),
        offset: parseInt(offset),
      });
    }

    // Fallback en memoria
    let log = [...inMemoryAuditLog];

    if (transport_mode) {
      log = log.filter(entry => {
        const tariff = inMemoryTariffs.get(transport_mode);
        return tariff && entry.tariff_rule_id === tariff.id;
      });
    }

    log.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const paged = log.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

    return res.json({
      audit_log: paged,
      total: log.length,
      limit: parseInt(limit),
      offset: parseInt(offset),
      source: 'in-memory',
    });

  } catch (err) {
    console.error('[TariffController] Error consultando audit log:', err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message });
  }
};

module.exports = {
  getTariffs,
  getTariffByMode,
  updateTariff,
  getAuditLog,
};
