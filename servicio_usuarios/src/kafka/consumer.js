const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'servicio_usuarios',
  brokers: [process.env.KAFKA_BROKER || 'kafka:9092']
});

const consumer = kafka.consumer({ groupId: 'servicio_usuarios-group' });

const connectConsumer = async (topics, messageHandler) => {
  try {
    await consumer.connect();
    console.log('[Kafka] Consumer connected');
    
    for (const topic of topics) {
      await consumer.subscribe({ topic, fromBeginning: true });
    }

    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        messageHandler(topic, message.value.toString());
      },
    });
  } catch (error) {
    console.error('[Kafka] Consumer connection error:', error);
  }
};

module.exports = { connectConsumer };
