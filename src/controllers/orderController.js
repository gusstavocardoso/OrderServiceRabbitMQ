const { createOrder, getAllOrders, getOrderById } = require('../services/orderService');

/**
 * POST /orders
 * Cria um novo pedido.
 */
async function create(req, res) {
  const { customer_name, customer_email, items } = req.body;

  // Validações básicas
  if (!customer_name || !customer_email) {
    return res.status(400).json({ error: 'customer_name e customer_email são obrigatórios.' });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'O pedido deve ter pelo menos um item.' });
  }

  for (const item of items) {
    if (!item.product || !item.quantity || !item.price) {
      return res.status(400).json({
        error: 'Cada item deve ter: product (string), quantity (number), price (number).',
      });
    }
    if (item.quantity <= 0 || item.price < 0) {
      return res.status(400).json({ error: 'quantity > 0 e price >= 0.' });
    }
  }

  try {
    const order = await createOrder({ customer_name, customer_email, items });
    return res.status(201).json({
      message: 'Pedido criado com sucesso! Aguardando processamento de pagamento.',
      order,
    });
  } catch (err) {
    console.error('[OrderController] Erro ao criar pedido:', err.message);
    return res.status(500).json({ error: 'Erro interno ao criar pedido.' });
  }
}

/**
 * GET /orders
 * Lista todos os pedidos.
 */
async function list(req, res) {
  try {
    const orders = await getAllOrders();
    return res.json({ count: orders.length, orders });
  } catch (err) {
    console.error('[OrderController] Erro ao listar pedidos:', err.message);
    return res.status(500).json({ error: 'Erro interno ao listar pedidos.' });
  }
}

/**
 * GET /orders/:id
 * Retorna um pedido pelo ID.
 */
async function getById(req, res) {
  try {
    const order = await getOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: `Pedido ${req.params.id} não encontrado.` });
    }
    return res.json(order);
  } catch (err) {
    console.error('[OrderController] Erro ao buscar pedido:', err.message);
    return res.status(500).json({ error: 'Erro interno ao buscar pedido.' });
  }
}

module.exports = { create, list, getById };
