const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'servicio_analitica',
  brokers: [process.env.KAFKA_BROKER || 'kafka:9092'],
  retry: { retries: 10, initialRetryTime: 3000 }
});

const consumer = kafka.consumer({ groupId: 'servicio_analitica-group' });

const connectConsumer = async (topics, messageHandler) => {
  let intentos = 0;
  while (intentos < 10) {
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
      return;
    } catch (error) {
      intentos++;
      console.error(`[Kafka] Reintento ${intentos}/10:`, error.message);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
};

module.exports = { connectConsumer };