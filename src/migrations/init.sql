-- ============================================================
--  Schema inicial do Order Service
--  Executado automaticamente pelo PostgreSQL na primeira vez
-- ============================================================

-- Extensão para usar UUID como PK
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Status possíveis de um pedido
CREATE TYPE order_status AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED');

-- Tabela principal de pedidos
CREATE TABLE IF NOT EXISTS orders (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_name  VARCHAR(150) NOT NULL,
    customer_email VARCHAR(150) NOT NULL,
    total       NUMERIC(10, 2) NOT NULL DEFAULT 0,
    status      order_status NOT NULL DEFAULT 'PENDING',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Itens de cada pedido (1 pedido → N itens)
CREATE TABLE IF NOT EXISTS order_items (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id   UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product    VARCHAR(200) NOT NULL,
    quantity   INTEGER NOT NULL CHECK (quantity > 0),
    price      NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    subtotal   NUMERIC(10, 2) GENERATED ALWAYS AS (quantity * price) STORED
);

-- Índice para buscas frequentes por email do cliente
CREATE INDEX IF NOT EXISTS idx_orders_customer_email ON orders(customer_email);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id  ON order_items(order_id);

-- Função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
