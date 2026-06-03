require('dotenv').config();
const express = require('express');
const testRoutes = require('./routes/testRoutes');

// Contadores básicos
global.eventosTotales = 0;
global.eventosVehiculos = 0;
global.pagos = 0;
global.alertas = 0;

// KPIs de movilidad
global.flujoPorCorredor = {}; // { corredor_id: count }
global.retrasosTotales = 0;
global.eventosConRetraso = 0;
global.co2Evitado = 0; // kg simulado
global.ocupacionTotal = 0;
global.ocupacionCount = 0;

const app = express();
const PORT = process.env.PORT || 3006;

app.use(express.json());
app.use('/api', testRoutes);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`servicio_analitica listening on port ${PORT}`);
});

const { connectConsumer } = require('./kafka/consumer');
setTimeout(() => {
  connectConsumer(['posiciones_vehiculos', 'payments', 'alerts'], (topic, message) => {
    global.eventosTotales++;

    try {
      const data = JSON.parse(message);

      if (topic === 'posiciones_vehiculos') {
        global.eventosVehiculos++;

        // Flujo por corredor
        const corredor = data.corridorId || 'desconocido';
        global.flujoPorCorredor[corredor] = (global.flujoPorCorredor[corredor] || 0) + 1;

        // Puntualidad
        global.retrasosTotales += data.retrasoMin || 0;
        if ((data.retrasoMin || 0) > 5) global.eventosConRetraso++;

        // CO2 evitado (buses y metro evitan autos)
        if (data.tipo === 'bus' || data.tipo === 'metro') {
          global.co2Evitado += 0.12; // kg CO2 por evento simulado
        }

        // Ocupación simulada
        const ocupacion = data.ocupacion || Math.floor(Math.random() * 40 + 60);
        global.ocupacionTotal += ocupacion;
        global.ocupacionCount++;
      }

      if (topic === 'payments') global.pagos++;
      if (topic === 'alerts') global.alertas++;

    } catch (e) {
      // mensaje no es JSON, igual contar
    }

    console.log(`[Data Lake] procesando evento de ${topic}...`);
    console.log(`[Métricas] Totales: ${global.eventosTotales}, Vehiculos: ${global.eventosVehiculos}, Pagos: ${global.pagos}, Alertas: ${global.alertas}`);
  });
}, 10000);