const express = require('express');
const ordersRouter = require('./routes/orders');

const app = express();

// Middlewares globais
app.use(express.json());

// Log de requisições
app.use((req, _res, next) => {
  console.log(`[HTTP] ${req.method} ${req.url}`);
  next();
});

// Rotas
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'order-service',
    timestamp: new Date().toISOString(),
  });
});

app.use('/orders', ordersRouter);

// 404 genérico
app.use((_req, res) => {
  res.status(404).json({ error: 'Rota não encontrada.' });
});

module.exports = app;
