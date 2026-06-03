const { Kafka } = require('kafkajs');
const supabase = require('../config/supabaseClient');

const kafka = new Kafka({
  clientId: 'servicio_notificaciones',
  brokers: [process.env.KAFKA_BROKER || 'kafka:9092']
});

const consumer = kafka.consumer({ groupId: 'servicio_notificaciones-group' });

const connectConsumer = async (topics = ['alerts', 'traffic-disruptions']) => {
  try {
    await consumer.connect();
    console.log('[Kafka] Consumer connected to broker:', process.env.KAFKA_BROKER || 'kafka:9092');
    
    for (const topic of topics) {
      await consumer.subscribe({ topic, fromBeginning: true });
      console.log(`[Kafka] Subscribed to topic: ${topic}`);
    }

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const rawValue = message.value.toString();
        console.log(`[Kafka] Mensaje recibido en topic '${topic}' (Partición: ${partition}):`);
        console.log(rawValue);

        try {
          let payload;
          try {
            payload = JSON.parse(rawValue);
          } catch (e) {
            // Si no es JSON, crear un payload genérico a partir del texto
            payload = {
              tipo_receptor: 'sistema',
              receptor_id: 'broadcast',
              viaje_id: null,
              tipo_alerta: 'general',
              mensaje: rawValue,
              detalles_desvio: {}
            };
          }

          const { tipo_receptor, receptor_id, viaje_id, tipo_alerta, mensaje, detalles_desvio } = payload;

          // Validar que tenga los campos mínimos necesarios
          const targetReceptorType = tipo_receptor || 'sistema';
          const targetReceptorId = receptor_id || 'broadcast';
          const targetAlert = tipo_alerta || 'general';
          const targetMessage = mensaje || rawValue;
          const targetDetails = detalles_desvio || (typeof payload === 'object' ? payload : {});

          console.log(`[Notificaciones - Push Simulado] Enviando alerta a ${targetReceptorType} (${targetReceptorId}): "${targetMessage}"`);

          if (!supabase) {
            console.warn('[Supabase] Cliente no configurado. No se persistirá el log.');
            return;
          }

          // Guardar registro en Supabase para trazabilidad regulatoria
          const newNotification = {
            tipo_receptor: targetReceptorType,
            receptor_id: targetReceptorId,
            viaje_id: viaje_id || null,
            tipo_alerta: targetAlert,
            mensaje: targetMessage,
            detalles_desvio: targetDetails,
            estado: 'enviado'
          };

          const { data, error } = await supabase
            .from('notificaciones')
            .insert([newNotification])
            .select();

          if (error) {
            console.error('[Supabase Error] Error al guardar la notificación:', error.message);
          } else {
            console.log('[Supabase OK] Notificación guardada para auditoría con ID:', data[0]?.id);
          }

        } catch (err) {
          console.error('[Kafka Consumer] Error procesando el mensaje:', err.message);
        }
      },
    });
  } catch (error) {
    console.error('[Kafka] Consumer connection error:', error);
  }
};

module.exports = { connectConsumer };
