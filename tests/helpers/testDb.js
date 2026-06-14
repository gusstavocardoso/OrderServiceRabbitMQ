const { query } = require('../../src/config/database');

/**
 * Limpa todas as tabelas do banco para garantir isolamento entre testes.
 * TRUNCATE com CASCADE remove também os order_items (FK cascade).
 */
async function cleanDatabase() {
  await query('TRUNCATE TABLE order_items, orders RESTART IDENTITY CASCADE');
}

/**
 * Fecha o pool de conexões do pg.
 * Deve ser chamado no afterAll para evitar que Jest fique "pendurado".
 */
async function closeDatabasePool() {
  const { Pool } = require('pg');
  // Acessa o pool interno do módulo database
  const db = require('../../src/config/database');
  if (db._pool && typeof db._pool.end === 'function') {
    await db._pool.end();
  }
}

module.exports = { cleanDatabase, closeDatabasePool };
