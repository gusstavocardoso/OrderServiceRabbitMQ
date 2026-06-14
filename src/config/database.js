const { Pool } = require('pg');

// Pool de conexões reutilizáveis com o PostgreSQL.
// Um "pool" evita abrir/fechar conexão a cada query — muito mais eficiente.
const pool = new Pool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     Number(process.env.DB_PORT) || 5432,
  user:     process.env.DB_USER     || 'orderuser',
  password: process.env.DB_PASSWORD || 'orderpass',
  database: process.env.DB_NAME     || 'orderdb',
  max: 10,              // máximo de conexões simultâneas no pool
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// Evento para logar erros silenciosos do pool (ex: banco caiu e voltou)
pool.on('error', (err) => {
  console.error('[DB] Erro inesperado no pool de conexões:', err.message);
});

/**
 * Executa uma query no banco.
 * @param {string} text  - SQL com placeholders ($1, $2, ...)
 * @param {Array}  params - Valores para os placeholders
 */
const query = (text, params) => pool.query(text, params);

/**
 * Retorna um client do pool para uso em transações manuais.
 * Lembre-se de chamar client.release() ao terminar!
 */
const getClient = () => pool.connect();

module.exports = { query, getClient, _pool: pool };

