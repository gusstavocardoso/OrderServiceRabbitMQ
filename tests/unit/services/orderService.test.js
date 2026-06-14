// Mocka os módulos externos ANTES de importar o service
jest.mock('../../../src/config/database');
jest.mock('../../../src/messaging/publisher');
jest.mock('../../../src/config/rabbitmq', () => ({
  ROUTING_KEY: 'order.created',
  EXCHANGE_NAME: 'orders',
  QUEUE_NAME: 'order.processing',
  DLQ_NAME: 'order.dlq',
  connect: jest.fn(),
  getChannel: jest.fn(),
}));

const { query, getClient } = require('../../../src/config/database');
const { publish } = require('../../../src/messaging/publisher');
const { createOrder, getAllOrders, getOrderById } = require('../../../src/services/orderService');

// Mock do client retornado pelo pool (usado em transações)
const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

// ─────────────────────────────────────────────
//  Dados de fixture reutilizáveis nos testes
// ─────────────────────────────────────────────
const mockOrder = {
  id: 'aaaaaaaa-0000-0000-0000-000000000001',
  customer_name: 'João Silva',
  customer_email: 'joao@email.com',
  total: '2679.80',
  status: 'PENDING',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const mockItems = [
  {
    id: 'bbbbbbbb-0000-0000-0000-000000000001',
    order_id: mockOrder.id,
    product: 'Notebook',
    quantity: 1,
    price: '2500.00',
    subtotal: '2500.00',
  },
  {
    id: 'bbbbbbbb-0000-0000-0000-000000000002',
    order_id: mockOrder.id,
    product: 'Mouse',
    quantity: 2,
    price: '89.90',
    subtotal: '179.80',
  },
];

const inputData = {
  customer_name: 'João Silva',
  customer_email: 'joao@email.com',
  items: [
    { product: 'Notebook', quantity: 1, price: 2500.00 },
    { product: 'Mouse', quantity: 2, price: 89.90 },
  ],
};

// ─────────────────────────────────────────────
//  createOrder
// ─────────────────────────────────────────────
describe('orderService.createOrder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getClient.mockResolvedValue(mockClient);
  });

  it('deve criar pedido com sucesso e retornar pedido com itens', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined)              // BEGIN
      .mockResolvedValueOnce({ rows: [mockOrder] })  // INSERT orders
      .mockResolvedValueOnce({ rows: [mockItems[0]] }) // INSERT item 1
      .mockResolvedValueOnce({ rows: [mockItems[1]] }) // INSERT item 2
      .mockResolvedValueOnce(undefined);             // COMMIT

    const result = await createOrder(inputData);

    expect(result.id).toBe(mockOrder.id);
    expect(result.customer_name).toBe('João Silva');
    expect(result.items).toHaveLength(2);
  });

  it('deve iniciar transação com BEGIN e confirmar com COMMIT', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [mockOrder] })
      .mockResolvedValueOnce({ rows: [mockItems[0]] })
      .mockResolvedValueOnce({ rows: [mockItems[1]] })
      .mockResolvedValueOnce(undefined);

    await createOrder(inputData);

    expect(mockClient.query).toHaveBeenNthCalledWith(1, 'BEGIN');
    expect(mockClient.query).toHaveBeenLastCalledWith('COMMIT');
  });

  it('deve publicar evento no RabbitMQ APÓS o commit', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [mockOrder] })
      .mockResolvedValueOnce({ rows: [mockItems[0]] })
      .mockResolvedValueOnce({ rows: [mockItems[1]] })
      .mockResolvedValueOnce(undefined);

    await createOrder(inputData);

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith('order.created', {
      orderId: mockOrder.id,
      customerEmail: mockOrder.customer_email,
      total: mockOrder.total,
    });
  });

  it('deve calcular o total corretamente (1*2500 + 2*89.90 = 2679.80)', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [mockOrder] })
      .mockResolvedValueOnce({ rows: [mockItems[0]] })
      .mockResolvedValueOnce({ rows: [mockItems[1]] })
      .mockResolvedValueOnce(undefined);

    await createOrder(inputData);

    // O total passado para o INSERT deve ser 2679.80
    const insertCall = mockClient.query.mock.calls[1]; // segunda call = INSERT orders
    expect(insertCall[1][2]).toBe('2679.80'); // 3º parâmetro do INSERT = total
  });

  it('deve fazer ROLLBACK e liberar o client quando ocorre erro no banco', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined)           // BEGIN
      .mockRejectedValueOnce(new Error('DB Error')); // INSERT orders falha

    await expect(createOrder(inputData)).rejects.toThrow('DB Error');

    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('NÃO deve publicar evento quando a transação falha', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('DB Error'));

    await expect(createOrder(inputData)).rejects.toThrow();

    expect(publish).not.toHaveBeenCalled();
  });

  it('deve sempre liberar o client do pool (mesmo com sucesso)', async () => {
    mockClient.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [mockOrder] })
      .mockResolvedValueOnce({ rows: [mockItems[0]] })
      .mockResolvedValueOnce({ rows: [mockItems[1]] })
      .mockResolvedValueOnce(undefined);

    await createOrder(inputData);

    expect(mockClient.release).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────
//  getAllOrders
// ─────────────────────────────────────────────
describe('orderService.getAllOrders', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deve retornar todos os pedidos com seus itens', async () => {
    query
      .mockResolvedValueOnce({ rows: [mockOrder] })   // SELECT orders
      .mockResolvedValueOnce({ rows: mockItems });    // SELECT order_items

    const result = await getAllOrders();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(mockOrder.id);
    expect(result[0].items).toHaveLength(2);
  });

  it('deve retornar array vazio quando não há pedidos', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const result = await getAllOrders();

    expect(result).toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('deve buscar itens para cada pedido retornado', async () => {
    const orders = [mockOrder, { ...mockOrder, id: 'aaaaaaaa-0000-0000-0000-000000000002' }];
    query
      .mockResolvedValueOnce({ rows: orders })   // SELECT orders (2 pedidos)
      .mockResolvedValueOnce({ rows: mockItems }) // items do pedido 1
      .mockResolvedValueOnce({ rows: [] });       // items do pedido 2

    const result = await getAllOrders();

    expect(result).toHaveLength(2);
    expect(query).toHaveBeenCalledTimes(3); // 1 para orders + 2 para items
  });
});

// ─────────────────────────────────────────────
//  getOrderById
// ─────────────────────────────────────────────
describe('orderService.getOrderById', () => {
  beforeEach(() => jest.clearAllMocks());

  it('deve retornar o pedido com seus itens quando o ID existe', async () => {
    query
      .mockResolvedValueOnce({ rows: [mockOrder] })
      .mockResolvedValueOnce({ rows: mockItems });

    const result = await getOrderById(mockOrder.id);

    expect(result.id).toBe(mockOrder.id);
    expect(result.items).toHaveLength(2);
  });

  it('deve retornar null quando o pedido não é encontrado', async () => {
    query.mockResolvedValueOnce({ rows: [] });

    const result = await getOrderById('id-inexistente');

    expect(result).toBeNull();
  });

  it('deve passar o ID correto para a query do banco', async () => {
    query
      .mockResolvedValueOnce({ rows: [mockOrder] })
      .mockResolvedValueOnce({ rows: mockItems });

    await getOrderById(mockOrder.id);

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('WHERE id = $1'),
      [mockOrder.id]
    );
  });
});
