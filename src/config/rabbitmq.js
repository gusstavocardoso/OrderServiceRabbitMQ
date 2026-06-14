const amqp = require('amqplib');

// Nome da exchange principal — ponto central que recebe as mensagens
const EXCHANGE_NAME = 'orders';

// Nome da fila de processamento
const QUEUE_NAME = 'order.processing';

// Dead Letter Queue — recebe mensagens que falharam várias vezes
const DLQ_NAME = 'order.dlq';

// Routing key usada ao publicar eventos de criação de pedido
const ROUTING_KEY = 'order.created';

let connection = null;
let channel = null;

/**
 * Conecta ao RabbitMQ e configura a topologia:
 *  - Exchange tipo 'direct'
 *  - Dead Letter Queue (DLQ)
 *  - Fila principal com DLQ configurada
 *
 * Tenta reconectar automaticamente em caso de falha.
 */
async function connect(retries = 10, delayMs = 3000) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      console.log(`[RabbitMQ] Tentativa de conexão ${attempt}/${retries}...`);
      connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672');
      channel = await connection.createChannel();

      // --- Configuração da topologia ---

      // 1. Exchange principal (tipo direct: roteia pela routing key)
      await channel.assertExchange(EXCHANGE_NAME, 'direct', { durable: true });

      // 2. Dead Letter Exchange (onde msgs rejeitadas vão parar)
      await channel.assertExchange('orders.dlx', 'direct', { durable: true });

      // 3. Dead Letter Queue (fila que recebe msgs com falha)
      await channel.assertQueue(DLQ_NAME, { durable: true });
      await channel.bindQueue(DLQ_NAME, 'orders.dlx', ROUTING_KEY);

      // 4. Fila principal com configuração de DLQ
      //    x-dead-letter-exchange: se a msg for rejeitada (NACK sem requeue), vai para a DLX
      //    x-message-ttl: msgs expiram após 10min se não consumidas
      await channel.assertQueue(QUEUE_NAME, {
        durable: true,
        arguments: {
          'x-dead-letter-exchange': 'orders.dlx',
          'x-dead-letter-routing-key': ROUTING_KEY,
          'x-message-ttl': 600000, // 10 minutos
        },
      });

      // 5. Vincula a fila à exchange com a routing key
      await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, ROUTING_KEY);

      // prefetch(1): consumer processa 1 mensagem por vez antes de pedir outra
      await channel.prefetch(1);

      console.log('[RabbitMQ] ✅ Conectado e topologia configurada!');

      // Listener para reconexão automática em caso de queda
      connection.on('close', () => {
        console.warn('[RabbitMQ] Conexão fechada. Reconectando em 5s...');
        setTimeout(() => connect(), 5000);
      });

      return { connection, channel };
    } catch (err) {
      console.error(`[RabbitMQ] Falha na tentativa ${attempt}: ${err.message}`);
      if (attempt < retries) {
        await new Promise((res) => setTimeout(res, delayMs));
      } else {
        throw new Error('[RabbitMQ] Não foi possível conectar após todas as tentativas.');
      }
    }
  }
}

const getChannel = () => {
  if (!channel) throw new Error('[RabbitMQ] Canal não inicializado. Chame connect() primeiro.');
  return channel;
};

module.exports = { connect, getChannel, EXCHANGE_NAME, QUEUE_NAME, DLQ_NAME, ROUTING_KEY };
