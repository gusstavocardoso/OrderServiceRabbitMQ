const { query, getClient } = require('../config/database');
const { publish } = require('../messaging/publisher');
const { ROUTING_KEY } = require('../config/rabbitmq');

/**
 * Cria um novo pedido com seus itens dentro de uma transação SQL.
 *
 * Transação garante atomicidade: ou salva o pedido + todos os itens,
 * ou não salva nada (evita pedido sem itens no banco).
 *
 * @param {object} data - { customer_name, customer_email, items[] }
 * @returns {object} Pedido criado com seus itens
 */
async function createOrder(data) {
  const { customer_name, customer_email, items } = data;

  // Calcula o total do pedido
  const total = items.reduce((sum, item) => sum + item.quantity * item.price, 0);

  // Obtém um client do pool para usar em transação manual
  const client = await getClient();

  try {
    // Inicia a transação
    await client.query('BEGIN');

    // Insere o pedido principal
    const orderResult = await client.query(
      `INSERT INTO orders (customer_name, customer_email, total)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [customer_name, customer_email, total.toFixed(2)]
    );
    const order = orderResult.rows[0];

    // Insere cada item do pedido
    const insertedItems = [];
    for (const item of items) {
      const itemResult = await client.query(
        `INSERT INTO order_items (order_id, product, quantity, price)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [order.id, item.product, item.quantity, item.price]
      );
      insertedItems.push(itemResult.rows[0]);
    }

    // Confirma a transação — persiste tudo no banco
    await client.query('COMMIT');

    // Publica evento no RabbitMQ para processamento assíncrono do pagamento
    // Feito APÓS o commit para garantir que o dado já está no banco
    publish(ROUTING_KEY, {
      orderId: order.id,
      customerEmail: order.customer_email,
      total: order.total,
    });

    return { ...order, items: insertedItems };
  } catch (err) {
    // Desfaz tudo em caso de erro
    await client.query('ROLLBACK');
    throw err;
  } finally {
    // Sempre libera o client de volta ao pool
    client.release();
  }
}

/**
 * Busca todos os pedidos com seus itens.
 */
async function getAllOrders() {
  const ordersResult = await query(
    `SELECT * FROM orders ORDER BY created_at DESC`
  );
  const orders = ordersResult.rows;

  // Para cada pedido, busca seus itens
  const ordersWithItems = await Promise.all(
    orders.map(async (order) => {
      const itemsResult = await query(
        `SELECT * FROM order_items WHERE order_id = $1`,
        [order.id]
      );
      return { ...order, items: itemsResult.rows };
    })
  );

  return ordersWithItems;
}

/**
 * Busca um pedido por ID com seus itens.
 */
async function getOrderById(id) {
  const orderResult = await query(
    `SELECT * FROM orders WHERE id = $1`,
    [id]
  );

  if (orderResult.rows.length === 0) return null;

  const order = orderResult.rows[0];

  const itemsResult = await query(
    `SELECT * FROM order_items WHERE order_id = $1`,
    [order.id]
  );

  return { ...order, items: itemsResult.rows };
}

module.exports = { createOrder, getAllOrders, getOrderById };
