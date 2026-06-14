const { getChannel, EXCHANGE_NAME, ROUTING_KEY } = require('../config/rabbitmq');

/**
 * Publica um evento no RabbitMQ.
 *
 * @param {string} routingKey - Routing key do evento (ex: 'order.created')
 * @param {object} payload    - Dados do evento (será serializado em JSON)
 */
function publish(routingKey, payload) {
  const channel = getChannel();

  const message = Buffer.from(JSON.stringify(payload));

  // persistent: true → mensagem sobrevive a reinicialização do broker
  channel.publish(EXCHANGE_NAME, routingKey, message, {
    persistent: true,
    contentType: 'application/json',
    timestamp: Date.now(),
  });

  console.log(`[Publisher] 📤 Evento publicado: ${routingKey}`, payload);
}

module.exports = { publish };
