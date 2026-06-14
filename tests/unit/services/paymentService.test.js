jest.mock('../../../src/config/database');

const { query } = require('../../../src/config/database');
const { processPayment } = require('../../../src/services/paymentService');

describe('paymentService.processPayment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers(); // simula setTimeout sem esperar 2 segundos reais
    query.mockResolvedValue({ rows: [] });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  // ─────────────────────────────────────────────
  //  Validação de input
  // ─────────────────────────────────────────────
  it('deve lançar erro quando orderId não é fornecido', async () => {
    // Não precisa de timer aqui — falha antes do setTimeout
    await expect(processPayment({})).rejects.toThrow('orderId ausente no payload');
  });

  it('deve lançar erro quando payload é undefined', async () => {
    await expect(processPayment(undefined)).rejects.toThrow();
  });

  // ─────────────────────────────────────────────
  //  Pagamento aprovado (Math.random >= 0.2)
  // ─────────────────────────────────────────────
  it('deve atualizar status para PAID quando pagamento é aprovado', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5); // >= 0.2 → sucesso

    const promise = processPayment({ orderId: 'test-uuid-paid' });
    await jest.runAllTimersAsync(); // avança o sleep(2000) sem esperar
    await promise;

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE orders SET status'),
      ['PAID', 'test-uuid-paid']
    );
  });

  it('deve resolver a promise (sem rejeição) quando pagamento é aprovado', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.9); // garantidamente sucesso

    const promise = processPayment({ orderId: 'test-uuid-ok' });
    await jest.runAllTimersAsync();

    await expect(promise).resolves.not.toThrow();
  });

  // ─────────────────────────────────────────────
  //  Pagamento recusado (Math.random < 0.2)
  // ─────────────────────────────────────────────
  it('deve atualizar status para FAILED quando pagamento é recusado', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.1); // < 0.2 → falha

    // Inicia a promise e os timers juntos para evitar unhandled rejection
    const assertionPromise = expect(
      processPayment({ orderId: 'test-uuid-fail' })
    ).rejects.toThrow('Pagamento recusado para o pedido test-uuid-fail');

    await jest.runAllTimersAsync();
    await assertionPromise;

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE orders SET status'),
      ['FAILED', 'test-uuid-fail']
    );
  });

  it('deve lançar erro com a mensagem correta quando pagamento falha', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.0); // garante falha

    // Inicia a promise e os timers juntos para evitar unhandled rejection
    const assertionPromise = expect(
      processPayment({ orderId: 'order-xyz' })
    ).rejects.toThrow('Pagamento recusado para o pedido order-xyz');

    await jest.runAllTimersAsync();
    await assertionPromise;
  });

  // ─────────────────────────────────────────────
  //  Interação com o banco
  // ─────────────────────────────────────────────
  it('deve chamar query UPDATE exatamente uma vez', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);

    const promise = processPayment({ orderId: 'test-uuid' });
    await jest.runAllTimersAsync();
    await promise;

    expect(query).toHaveBeenCalledTimes(1);
  });

  it('deve propagar erro do banco quando a query de UPDATE falha', async () => {
    jest.spyOn(Math, 'random').mockReturnValue(0.5);
    query.mockRejectedValue(new Error('DB connection lost'));

    // Inicia a promise e os timers juntos para evitar unhandled rejection
    const assertionPromise = expect(
      processPayment({ orderId: 'test-uuid' })
    ).rejects.toThrow('DB connection lost');

    await jest.runAllTimersAsync();
    await assertionPromise;
  });
});
