jest.mock('../../../src/services/orderService');
jest.mock('../../../src/config/rabbitmq', () => ({
  ROUTING_KEY: 'order.created',
  connect: jest.fn(),
  getChannel: jest.fn(),
}));

const request = require('supertest');
const app = require('../../../src/app');
const { createOrder, getAllOrders, getOrderById } = require('../../../src/services/orderService');

const mockOrder = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  customer_name: 'João Silva',
  customer_email: 'joao@email.com',
  total: '2679.80',
  status: 'PENDING',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  items: [
    { id: 'item-1', product: 'Notebook', quantity: 1, price: '2500.00', subtotal: '2500.00' },
    { id: 'item-2', product: 'Mouse', quantity: 2, price: '89.90', subtotal: '179.80' },
  ],
};

const validPayload = {
  customer_name: 'João Silva',
  customer_email: 'joao@email.com',
  items: [
    { product: 'Notebook', quantity: 1, price: 2500.00 },
    { product: 'Mouse', quantity: 2, price: 89.90 },
  ],
};

beforeEach(() => jest.clearAllMocks());

// ─────────────────────────────────────────────
//  GET /health
// ─────────────────────────────────────────────
describe('GET /health', () => {
  it('deve retornar status 200 e body com status ok', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('order-service');
    expect(res.body.timestamp).toBeDefined();
  });
});

// ─────────────────────────────────────────────
//  POST /orders — casos de sucesso
// ─────────────────────────────────────────────
describe('POST /orders — sucesso', () => {
  it('deve retornar 201 e o pedido criado', async () => {
    createOrder.mockResolvedValue(mockOrder);

    const res = await request(app)
      .post('/orders')
      .send(validPayload)
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body.order.id).toBe(mockOrder.id);
    expect(res.body.order.status).toBe('PENDING');
    expect(res.body.message).toContain('sucesso');
  });

  it('deve chamar createOrder com os dados corretos', async () => {
    createOrder.mockResolvedValue(mockOrder);

    await request(app).post('/orders').send(validPayload);

    expect(createOrder).toHaveBeenCalledWith({
      customer_name: validPayload.customer_name,
      customer_email: validPayload.customer_email,
      items: validPayload.items,
    });
  });
});

// ─────────────────────────────────────────────
//  POST /orders — validações de input
// ─────────────────────────────────────────────
describe('POST /orders — validações', () => {
  it('deve retornar 400 quando customer_name está ausente', async () => {
    const res = await request(app)
      .post('/orders')
      .send({ customer_email: 'joao@email.com', items: [{ product: 'X', quantity: 1, price: 10 }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('customer_name');
  });

  it('deve retornar 400 quando customer_email está ausente', async () => {
    const res = await request(app)
      .post('/orders')
      .send({ customer_name: 'João', items: [{ product: 'X', quantity: 1, price: 10 }] });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('customer_email');
  });

  it('deve retornar 400 quando items está ausente', async () => {
    const res = await request(app)
      .post('/orders')
      .send({ customer_name: 'João', customer_email: 'joao@email.com' });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('deve retornar 400 quando items é um array vazio', async () => {
    const res = await request(app)
      .post('/orders')
      .send({ customer_name: 'João', customer_email: 'joao@email.com', items: [] });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('deve retornar 400 quando item está sem product', async () => {
    const res = await request(app)
      .post('/orders')
      .send({
        customer_name: 'João',
        customer_email: 'joao@email.com',
        items: [{ quantity: 1, price: 100 }],
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('deve retornar 400 quando quantity é negativa', async () => {
    const res = await request(app)
      .post('/orders')
      .send({
        customer_name: 'João',
        customer_email: 'joao@email.com',
        items: [{ product: 'X', quantity: -1, price: 100 }],
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('deve retornar 400 quando price é negativo', async () => {
    const res = await request(app)
      .post('/orders')
      .send({
        customer_name: 'João',
        customer_email: 'joao@email.com',
        items: [{ product: 'X', quantity: 1, price: -10 }],
      });

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

  it('NÃO deve chamar createOrder quando payload é inválido', async () => {
    await request(app)
      .post('/orders')
      .send({ customer_email: 'joao@email.com' });

    expect(createOrder).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────
//  POST /orders — erro interno
// ─────────────────────────────────────────────
describe('POST /orders — erro interno', () => {
  it('deve retornar 500 quando createOrder lança exceção', async () => {
    createOrder.mockRejectedValue(new Error('DB Error'));

    const res = await request(app).post('/orders').send(validPayload);

    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty('error');
  });
});

// ─────────────────────────────────────────────
//  GET /orders
// ─────────────────────────────────────────────
describe('GET /orders', () => {
  it('deve retornar 200 com lista de pedidos', async () => {
    getAllOrders.mockResolvedValue([mockOrder]);

    const res = await request(app).get('/orders');

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    expect(res.body.orders).toHaveLength(1);
    expect(res.body.orders[0].id).toBe(mockOrder.id);
  });

  it('deve retornar count 0 e array vazio quando não há pedidos', async () => {
    getAllOrders.mockResolvedValue([]);

    const res = await request(app).get('/orders');

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(0);
    expect(res.body.orders).toEqual([]);
  });

  it('deve retornar 500 quando getAllOrders lança exceção', async () => {
    getAllOrders.mockRejectedValue(new Error('DB Error'));

    const res = await request(app).get('/orders');

    expect(res.status).toBe(500);
  });
});

// ─────────────────────────────────────────────
//  GET /orders/:id
// ─────────────────────────────────────────────
describe('GET /orders/:id', () => {
  it('deve retornar 200 com o pedido quando ID existe', async () => {
    getOrderById.mockResolvedValue(mockOrder);

    const res = await request(app).get(`/orders/${mockOrder.id}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(mockOrder.id);
    expect(res.body.items).toHaveLength(2);
  });

  it('deve retornar 404 quando o pedido não existe', async () => {
    getOrderById.mockResolvedValue(null);

    const res = await request(app).get('/orders/00000000-0000-0000-0000-000000000000');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });

  it('deve retornar 500 quando getOrderById lança exceção', async () => {
    getOrderById.mockRejectedValue(new Error('DB Error'));

    const res = await request(app).get(`/orders/${mockOrder.id}`);

    expect(res.status).toBe(500);
  });
});

// ─────────────────────────────────────────────
//  Rota inexistente
// ─────────────────────────────────────────────
describe('Rota inexistente', () => {
  it('deve retornar 404 para rotas não mapeadas', async () => {
    const res = await request(app).get('/rota-que-nao-existe');

    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('error');
  });
});
