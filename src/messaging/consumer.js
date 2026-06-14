const { getChannel, QUEUE_NAME } = require('../config/rabbitmq');
const { processPayment } = require('../services/paymentService');

/**
 * Inicia o consumer que escuta a fila de processamento de pedidos.
 *
 * Fluxo por mensagem:
 *  1. Deserializa o JSON da mensagem
 *  2. Chama paymentService para simular o processamento
 *  3. ACK  → mensagem removida da fila (sucesso)
 *  4. NACK → mensagem vai para a Dead Letter Queue (falha definitiva)
 */
async function startConsumer() {
  const channel = getChannel();

  console.log(`[Consumer] 👂 Aguardando mensagens na fila: ${QUEUE_NAME}`);

  await channel.consume(QUEUE_NAME, async (msg) => {
    if (!msg) return; // mensagem cancelada pelo broker

    let payload;
    try {
      payload = JSON.parse(msg.content.toString());
      console.log(`[Consumer] 📥 Mensagem recebida — Pedido ID: ${payload.orderId}`);
    } catch (err) {
      // JSON inválido: não tem como processar, manda para DLQ imediatamente
      console.error('[Consumer] ❌ Mensagem com JSON inválido. Enviando para DLQ.');
      channel.nack(msg, false, false); // requeue: false → vai para DLQ
      return;
    }

    try {
      await processPayment(payload);
      // ACK: informa ao broker que a mensagem foi processada com sucesso
      channel.ack(msg);
      console.log(`[Consumer] ✅ Pedido ${payload.orderId} processado com sucesso.`);
    } catch (err) {
      console.error(`[Consumer] ❌ Erro ao processar pedido ${payload.orderId}:`, err.message);
      // NACK sem requeue: mensagem vai para a Dead Letter Queue
      channel.nack(msg, false, false);
    }
  });
}

module.exports = { startConsumer };
