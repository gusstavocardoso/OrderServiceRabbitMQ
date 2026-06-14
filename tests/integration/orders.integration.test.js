/**
 * Testes de Integração — Order Service
 *
 * Requerem um PostgreSQL real rodando.
 * O publisher do RabbitMQ é mockado para evitar dependência do broker.
 *
 * Para rodar localmente: npm run test:integration
 * (com os containers Docker já no ar)
 *
 * No CI: o banco é provisionado como service do GitHub Actions.
 */

// Mocka RabbitMQ — sem broker real nos testes de integração
jest.mock('../../src/messaging/publisher', () => ({ publish: jest.fn() }));
jest.mock('../../src/config/rabbitmq', () => ({
  ROUTING_KEY: 'order.created',
  EXCHANGE_NAME: 'orders',
  QUEUE_NAME: 'order.processing',
  DLQ_NAME: 'order.dlq',
  connect: jest.fn().mockResolvedValue({}),
  getChannel: jest.fn(),
}));

const request = require('supertest');
const app = require('../../src/app');
const { query, _pool } = require('../../src/config/database');
const { publish } = require('../../src/messaging/publisher');

// ─────────────────────────────────────────────
//  Setup / Teardown
// ─────────────────────────────────────────────
beforeEach(async () => {
  // Limpa o banco antes de cada teste para garantir isolamento
  await query('TRUNCATE TABLE order_items, orders RESTART IDENTITY CASCADE');
  jest.clearAllMocks();
});

afterAll(async () => {
  // Fecha o pool para o Jest não ficar pendurado
  await _pool.end();
});

// ─────────────────────────────────────────────
//  Fixtures
// ─────────────────────────────────────────────
const validPayload = {
  customer_name: 'Ana Souza',
  customer_email: 'ana.souza@email.com',
  items: [
    { product: 'Notebook Dell XPS', quantity: 1, price: 4500.00 },
    { product: 'Mouse Logitech',    quantity: 2, price: 299.90 },
  ],
};

// ─────────────────────────────────────────────
//  GET /health
// ─────────────────────────────────────────────
describe('[Integration] GET /health', () => {
  it('deve retornar status ok', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('order-service');
  });
});

// ─────────────────────────────────────────────
//  POST /orders
// ─────────────────────────────────────────────
describe('[Integration] POST /orders', () => {
  it('deve criar pedido e persistir no banco com status PENDING', async () => {
    const res = await request(app)
      .post('/orders')
      .send(validPayload)
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body.order.status).toBe('PENDING');
    expect(res.body.order.customer_name).toBe(validPayload.customer_name);

    // Confirma que o dado foi de fato persistido no banco
    const dbResult = await query('SELECT * FROM orders WHERE id = $1', [res.body.order.id]);
    expect(dbResult.rows).toHaveLength(1);
    expect(dbResult.rows[0].status).toBe('PENDING');
  });

  it('deve persistir os itens do pedido no banco', async () => {
    const res = await request(app).post('/orders').send(validPayload);

    const itemsResult = await query(
      'SELECT * FROM order_items WHERE order_id = $1',
      [res.body.order.id]
    );

    expect(itemsResult.rows).toHaveLength(2);
    expect(itemsResult.rows[0].product).toBe('Notebook Dell XPS');
    expect(itemsResult.rows[1].product).toBe('Mouse Logitech');
  });

  it('deve calcular o total corretamente (1*4500 + 2*299.90 = 5099.80)', async () => {
    const res = await request(app).post('/orders').send(validPayload);

    expect(parseFloat(res.body.order.total)).toBe(5099.80);
  });

  it('deve calcular subtotais nos itens (coluna GENERATED)', async () => {
    const res = await request(app).post('/orders').send(validPayload);

    const mouseItem = res.body.order.items.find((i) => i.product === 'Mouse Logitech');
    expect(parseFloat(mouseItem.subtotal)).toBe(599.80); // 2 * 299.90
  });

  it('deve publicar evento no RabbitMQ após criar o pedido', async () => {
    const res = await request(app).post('/orders').send(validPayload);

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith('order.created', expect.objectContaining({
      orderId: res.body.order.id,
      customerEmail: validPayload.customer_email,
    }));
  });

  it('deve retornar 400 para payload inválido (sem customer_name)', async () => {
    const res = await request(app)
      .post('/orders')
      .send({ customer_email: 'x@x.com', items: [{ product: 'X', quantity: 1, price: 10 }] });

    expect(res.status).toBe(400);
    expect(publish).not.toHaveBeenCalled();
  });

  it('NÃO deve persistir nada no banco quando o payload é inválido', async () => {
    await request(app)
      .post('/orders')
      .send({ customer_name: 'X', customer_email: 'x@x.com', items: [] });

    const result = await query('SELECT COUNT(*) FROM orders');
    expect(parseInt(result.rows[0].count)).toBe(0);
  });
});

// ─────────────────────────────────────────────
//  GET /orders
// ─────────────────────────────────────────────
describe('[Integration] GET /orders', () => {
  it('deve retornar array vazio quando não há pedidos', async () => {
    const res = await request(app).get('/orders');

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
    expect(res.body.orders).toEqual([]);
  });

  it('deve retornar todos os pedidos criados', async () => {
    // Cria 2 pedidos
    await request(app).post('/orders').send(validPayload);
    await request(app).post('/orders').send({
      ...validPayload,
      customer_name: 'Bruno Lima',
      customer_email: 'bruno@email.com',
    });

    const res = await request(app).get('/orders');

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(2);
    expect(res.body.orders).toHaveLength(2);
  });

  it('deve retornar cada pedido com seus itens', async () => {
    await request(app).post('/orders').send(validPayload);

    const res = await request(app).get('/orders');

    expect(res.body.orders[0].items).toBeDefined();
    expect(Array.isArray(res.body.orders[0].items)).toBe(true);
    expect(res.body.orders[0].items.length).toBeGreaterThan(0);
  });

  it('deve retornar pedidos ordenados por data (mais recente primeiro)', async () => {
    await request(app).post('/orders').send({ ...validPayload, customer_name: 'Primeiro' });
    await request(app).post('/orders').send({ ...validPayload, customer_name: 'Segundo' });

    const res = await request(app).get('/orders');

    // O mais recente vem primeiro
    expect(res.body.orders[0].customer_name).toBe('Segundo');
    expect(res.body.orders[1].customer_name).toBe('Primeiro');
  });
});

// ─────────────────────────────────────────────
//  GET /orders/:id
// ─────────────────────────────────────────────
describe('[Integration] GET /orders/:id', () => {
  it('deve retornar o pedido com seus itens quando o ID existe', async () => {
    const created = await request(app).post('/orders').send(validPayload);
    const orderId = created.body.order.id;

    const res = await request(app).get(`/orders/${orderId}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(orderId);
    expect(res.body.items).toHaveLength(2);
  });

  it('deve retornar 404 para UUID que não existe no banco', async () => {
    const res = await request(app).get('/orders/00000000-0000-0000-0000-000000000000');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});

// ─────────────────────────────────────────────
//  Fluxo completo end-to-end
// ─────────────────────────────────────────────
describe('[Integration] Fluxo completo', () => {
  it('deve criar pedido, buscá-lo por ID e ter os dados consistentes', async () => {
    // 1. Cria o pedido
    const createRes = await request(app).post('/orders').send(validPayload);
    expect(createRes.status).toBe(201);

    const orderId = createRes.body.order.id;

    // 2. Busca o pedido por ID
    const getRes = await request(app).get(`/orders/${orderId}`);
    expect(getRes.status).toBe(200);

    // 3. Verifica consistência dos dados
    expect(getRes.body.customer_name).toBe(validPayload.customer_name);
    expect(getRes.body.customer_email).toBe(validPayload.customer_email);
    expect(parseFloat(getRes.body.total)).toBe(5099.80);
    expect(getRes.body.status).toBe('PENDING');

    // 4. Verifica que aparece na listagem
    const listRes = await request(app).get('/orders');
    const found = listRes.body.orders.find((o) => o.id === orderId);
    expect(found).toBeDefined();
  });
});
