const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'servicio_tracking',
  brokers: [process.env.KAFKA_BROKER || 'kafka:9092']
});

const producer = kafka.producer();

const connectProducer = async () => {
  try {
    await producer.connect();
    console.log('[Kafka] Producer connected');
  } catch (error) {
    console.error('[Kafka] Producer connection error:', error);
  }
};

const sendMessage = async (topic, message) => {
  try {
    await producer.send({
      topic,
      messages: [{ value: JSON.stringify(message) }],
    });
    console.log(`[Kafka] Mensaje publicado en topic "${topic}" — vehicleId: ${message.vehicleId}`);
  } catch (error) {
    console.error(`[Kafka] Error enviando mensaje a ${topic}:`, error);
  }
};

module.exports = { connectProducer, sendMessage };
