/**
 * UrbanFlow Technologies – Servicio de Pagos Unificado
 * 
 * Microservicio de pago unificado que soporta:
 * - Billeteras virtuales con saldo
 * - Métodos de pago: NFC, QR, App Móvil
 * - Viajes multimodales con cobro automático
 * - Motor de tarifas con descuentos por transbordo y recargos en hora pico
 * - Trazabilidad de cambios de tarifa para auditoría regulatoria
 * - Integración Kafka para event streaming
 * 
 * MODO: MVP Simulado (ningún pago es real)
 */

require('dotenv').config();
const express = require('express');

// Routes
const testRoutes = require('./routes/testRoutes');
const walletRoutes = require('./routes/walletRoutes');
const paymentMethodRoutes = require('./routes/paymentMethodRoutes');
const tripRoutes = require('./routes/tripRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const tariffRoutes = require('./routes/tariffRoutes');

// Kafka
const { connectProducer, sendMessage } = require('./kafka/producer');
const { connectConsumer } = require('./kafka/consumer');

const app = express();
const PORT = process.env.PORT || 3004;

// ── Middleware global ──
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${req.method}] ${req.originalUrl} → ${res.statusCode} (${duration}ms)`);
  });
  next();
});

// ── Health check ──
app.get('/api/health', (req, res) => {
  res.json({
    service: 'servicio_pagos',
    status: 'ok',
    mode: 'MVP Simulado (hardcoded)',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    endpoints: {
      wallets: '/api/wallets',
      payment_methods: '/api/payment-methods',
      trips: '/api/trips',
      transactions: '/api/transactions',
      tariffs: '/api/tariffs',
    },
  });
});

// ── API Routes ──
app.use('/api', testRoutes);
app.use('/api/wallets', walletRoutes);
app.use('/api/payment-methods', paymentMethodRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/tariffs', tariffRoutes);

// ── 404 handler ──
app.use((req, res) => {
  res.status(404).json({
    error: 'NOT_FOUND',
    message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`,
    available_endpoints: '/api/health',
  });
});

// ── Error handler global ──
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: err.message,
  });
});

// ── Start server ──
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n╔══════════════════════════════════════════════════╗`);
  console.log(`║   UrbanFlow Technologies - Servicio de Pagos    ║`);
  console.log(`║   MVP Simulado (ningún pago es real)            ║`);
  console.log(`║   Puerto: ${PORT}                                  ║`);
  console.log(`╚══════════════════════════════════════════════════╝\n`);
});

// ── Kafka Producer ──
connectProducer()
  .then(() => {
    console.log('[Kafka] Producer listo para eventos de pagos');
  })
  .catch((err) => {
    console.warn('[Kafka] Producer no disponible (el servicio funcionará sin Kafka):', err.message);
  });

// ── Kafka Consumer (escuchar eventos de otros servicios) ──
const handleKafkaMessage = async (topic, message) => {
  try {
    const data = JSON.parse(message);
    console.log(`[Kafka] Mensaje recibido en ${topic}:`, JSON.stringify(data).substring(0, 200));

    switch (topic) {
      case 'tracking.trip.completed':
        // Auto-completar viaje y cobrar cuando tracking dice que terminó
        console.log(`[Kafka] Viaje completado desde tracking: ${data.trip_id}`);
        // En un sistema real, aquí se llamaría a tripController.completeTrip
        break;

      case 'rutas.trip.estimated':
        // Recibir estimación de costo desde el servicio de rutas
        console.log(`[Kafka] Estimación de ruta recibida para usuario: ${data.user_id}`);
        break;

      default:
        console.log(`[Kafka] Topic no manejado: ${topic}`);
    }
  } catch (err) {
    console.error(`[Kafka] Error procesando mensaje de ${topic}:`, err.message);
  }
};

connectConsumer(['tracking.trip.completed', 'rutas.trip.estimated'], handleKafkaMessage)
  .catch((err) => {
    console.warn('[Kafka] Consumer no disponible (el servicio funcionará sin Kafka):', err.message);
  });
