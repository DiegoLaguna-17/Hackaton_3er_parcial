const supabase = require('../config/supabaseClient');
const { sendMessage } = require('../kafka/producer');

// Obtener el historial de notificaciones (opcionalmente filtrado por receptor_id y tipo_receptor)
const getNotifications = async (req, res) => {
  try {
    const { receptor_id, tipo_receptor } = req.query;
    
    if (!supabase) {
      return res.status(500).json({ error: 'Database client is not initialized.' });
    }

    let query = supabase.from('notificaciones').select('*').order('creado_at', { ascending: false });

    if (receptor_id) {
      query = query.eq('receptor_id', receptor_id);
    }
    if (tipo_receptor) {
      query = query.eq('tipo_receptor', tipo_receptor);
    }

    const { data, error } = await query;

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json({
      status: 'success',
      count: data.length,
      data
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Guardar una notificación directamente en la base de datos (HTTP POST)
const sendDirectNotification = async (req, res) => {
  try {
    const { tipo_receptor, receptor_id, viaje_id, tipo_alerta, mensaje, detalles_desvio } = req.body;

    if (!tipo_receptor || !receptor_id || !tipo_alerta || !mensaje) {
      return res.status(400).json({ error: 'Faltan campos obligatorios: tipo_receptor, receptor_id, tipo_alerta, mensaje' });
    }

    if (!supabase) {
      return res.status(500).json({ error: 'Database client is not initialized.' });
    }

    const newNotification = {
      tipo_receptor,
      receptor_id,
      viaje_id: viaje_id || null,
      tipo_alerta,
      mensaje,
      detalles_desvio: detalles_desvio || {},
      estado: 'enviado'
    };

    const { data, error } = await supabase
      .from('notificaciones')
      .insert([newNotification])
      .select();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.status(201).json({
      status: 'success',
      message: 'Notificación enviada y registrada directamente en base de datos',
      data: data[0]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Endpoint simulador: publica un evento en Kafka para probar el flujo reactivo
const simulateKafkaEvent = async (req, res) => {
  try {
    const { topic, message } = req.body;
    
    // Valores predeterminados si no se proveen
    const targetTopic = topic || 'alerts';
    const alertMessage = message || {
      tipo_receptor: 'ciudadano',
      receptor_id: 'usr_12345',
      viaje_id: 'trip_abc987',
      tipo_alerta: 'desvio',
      mensaje: '¡Alerta de tráfico! Su bus 102A tomará un desvío debido a congestión en la Av. Principal.',
      detalles_desvio: {
        bus_afectado: '102A',
        via_alterna: 'Calle Secundaria 4',
        demora_estimada_minutos: 15
      }
    };

    console.log(`[Simulador] Publicando evento de prueba en Kafka, topic: ${targetTopic}`);
    
    // Publicar evento en Kafka
    await sendMessage(targetTopic, alertMessage);

    res.json({
      status: 'success',
      message: `Evento simulado publicado exitosamente en el tópico Kafka '${targetTopic}'`,
      published_payload: alertMessage
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  getNotifications,
  sendDirectNotification,
  simulateKafkaEvent
};
