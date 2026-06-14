const { query } = require('../config/database');

/**
 * Simula o processamento de pagamento de um pedido.
 *
 * Em um sistema real, aqui chamaria uma API de gateway de pagamento
 * (Stripe, PagSeguro, etc.). Para fins de estudo, simulamos com:
 *  - Delay de 2 segundos (simula latência de rede)
 *  - 80% de chance de sucesso, 20% de falha aleatória
 *
 * @param {{ orderId: string }} payload
 */
async function processPayment({ orderId }) {
  if (!orderId) throw new Error('orderId ausente no payload');

  console.log(`[PaymentService] 💳 Processando pagamento do pedido ${orderId}...`);

  // Simula latência de um gateway de pagamento externo
  await sleep(2000);

  // Simula falha aleatória (20% de chance)
  const failed = Math.random() < 0.2;

  if (failed) {
    await updateOrderStatus(orderId, 'FAILED');
    throw new Error(`Pagamento recusado para o pedido ${orderId}`);
  }

  await updateOrderStatus(orderId, 'PAID');
  console.log(`[PaymentService] ✅ Pagamento aprovado para o pedido ${orderId}`);
}

/**
 * Atualiza o status de um pedido no banco de dados.
 * O trigger do banco cuida de atualizar o campo updated_at automaticamente.
 */
async function updateOrderStatus(orderId, status) {
  await query(
    `UPDATE orders SET status = $1 WHERE id = $2`,
    [status, orderId]
  );
  console.log(`[PaymentService] 🔄 Pedido ${orderId} → status: ${status}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = { processPayment };
