const app = require('./app');
const { connect } = require('./config/rabbitmq');
const { startConsumer } = require('./messaging/consumer');

const PORT = process.env.PORT || 3000;

/**
 * Inicialização da aplicação.
 * Conecta ao RabbitMQ antes de subir o servidor HTTP para garantir
 * que o canal esteja disponível para publisher e consumer.
 */
async function bootstrap() {
  try {
    console.log('[App] 🚀 Iniciando Order Service...');

    // 1. Conecta ao RabbitMQ e configura a topologia
    await connect();

    // 2. Inicia o consumer em background
    await startConsumer();

    // 3. Sobe o servidor HTTP
    app.listen(PORT, () => {
      console.log(`[App] ✅ Servidor rodando em http://localhost:${PORT}`);
      console.log(`[App] 📋 Endpoints disponíveis:`);
      console.log(`      GET  /health`);
      console.log(`      GET  /orders`);
      console.log(`      GET  /orders/:id`);
      console.log(`      POST /orders`);
      console.log(`[App] 🐰 RabbitMQ UI: http://localhost:15672 (guest/guest)`);
    });
  } catch (err) {
    console.error('[App] ❌ Falha ao iniciar aplicação:', err.message);
    process.exit(1);
  }
}

bootstrap();
