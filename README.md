# 📦 Order Service — Microserviço de Pedidos

Projeto de estudos de um microserviço em **Node.js** com:
- **REST API** (Express)
- **Mensageria assíncrona** (RabbitMQ)
- **Banco de dados relacional** (PostgreSQL)
- **Docker Compose** para toda a infra

---

## 🏗️ Arquitetura

```
Cliente (curl/Insomnia)
        │
        ▼ REST (HTTP)
 ┌──────────────────┐
 │   Express API    │
 │  (porta 3000)    │
 └──────┬───────────┘
        │ INSERT (transação SQL)
        ▼
 ┌──────────────────┐
 │   PostgreSQL     │  ← orders + order_items
 │  (porta 5432)    │
 └──────────────────┘
        │
        │ publish (após commit)
        ▼
 ┌──────────────────┐
 │    RabbitMQ      │  ← Exchange "orders" → Queue "order.processing"
 │  (porta 5672)    │
 └──────┬───────────┘
        │ consume
        ▼
 ┌──────────────────┐
 │ Payment Consumer │  ← processa pagamento, atualiza status no banco
 └──────────────────┘
```

---

## 🔄 Fluxo de um Pedido

1. `POST /orders` recebe o pedido com cliente e itens
2. Service abre uma **transação SQL** e salva pedido + itens no PostgreSQL (status: `PENDING`)
3. Após o commit, **publica um evento** `order.created` no RabbitMQ
4. O **Consumer** (rodando em background no mesmo processo) recebe a mensagem
5. Simula o processamento do pagamento (2 segundos de delay, 80% sucesso)
6. Atualiza o status do pedido para `PAID` ou `FAILED`
7. `GET /orders/:id` retorna o pedido com o status atualizado

---

## 🐰 Conceitos do RabbitMQ demonstrados

| Conceito | Onde | Para quê |
|---|---|---|
| **Exchange** (direct) | `config/rabbitmq.js` | Ponto central que recebe e roteia mensagens |
| **Queue** | `order.processing` | Fila de processamento do consumer |
| **Routing Key** | `order.created` | Define qual fila recebe a mensagem |
| **Binding** | Exchange → Queue | Liga a exchange à fila pela routing key |
| **Persistent** | `publisher.js` | Mensagem sobrevive a reinicialização do broker |
| **prefetch(1)** | `rabbitmq.js` | Consumer processa 1 msg por vez (back-pressure) |
| **ACK** | `consumer.js` | Confirma que a mensagem foi processada com sucesso |
| **NACK** | `consumer.js` | Rejeita a mensagem (vai para a DLQ) |
| **Dead Letter Queue** | `order.dlq` | Recebe mensagens que falharam (auditoria/retry manual) |

---

## 🗄️ Banco de Dados (PostgreSQL)

```sql
-- Pedido principal
orders (
  id             UUID PRIMARY KEY,
  customer_name  VARCHAR(150),
  customer_email VARCHAR(150),
  total          NUMERIC(10,2),
  status         ENUM('PENDING', 'PROCESSING', 'PAID', 'FAILED'),
  created_at     TIMESTAMPTZ,
  updated_at     TIMESTAMPTZ  ← atualizado automaticamente por trigger
)

-- Itens do pedido
order_items (
  id         UUID PRIMARY KEY,
  order_id   UUID → orders.id (CASCADE DELETE),
  product    VARCHAR(200),
  quantity   INTEGER,
  price      NUMERIC(10,2),
  subtotal   NUMERIC(10,2)  ← coluna calculada (quantity * price)
)
```

---

## 🚀 Como rodar

### Pré-requisitos
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado e rodando

### 1. Subir tudo com Docker Compose

```bash
docker-compose up --build
```

Aguarde as mensagens:
```
[RabbitMQ] ✅ Conectado e topologia configurada!
[Consumer] 👂 Aguardando mensagens na fila: order.processing
[App] ✅ Servidor rodando em http://localhost:3000
```

### 2. Testar a API

#### Criar um pedido
```bash
curl -X POST http://localhost:3000/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name": "João Silva",
    "customer_email": "joao@email.com",
    "items": [
      { "product": "Notebook", "quantity": 1, "price": 2500.00 },
      { "product": "Mouse", "quantity": 2, "price": 89.90 }
    ]
  }'
```

#### Listar todos os pedidos
```bash
curl http://localhost:3000/orders
```

#### Buscar pedido por ID (aguarde ~2s para ver o status atualizado)
```bash
curl http://localhost:3000/orders/<id-retornado>
```

#### Health check
```bash
curl http://localhost:3000/health
```

### 3. Acompanhar o RabbitMQ visualmente

Acesse o **Management UI**: [http://localhost:15672](http://localhost:15672)
- Usuário: `guest`
- Senha: `guest`

Vá em **Queues** para ver mensagens sendo publicadas e consumidas em tempo real.

---

## 📁 Estrutura do Projeto

```
order-service/
├── docker-compose.yml       # Orquestra PostgreSQL, RabbitMQ e a aplicação
├── Dockerfile               # Imagem da aplicação Node.js
├── package.json
├── .env.example             # Variáveis de ambiente (copie para .env)
└── src/
    ├── index.js             # Entry point: bootstrap da app
    ├── config/
    │   ├── database.js      # Pool de conexões PostgreSQL (pg)
    │   └── rabbitmq.js      # Conexão + topologia (exchange, queues, DLQ)
    ├── routes/
    │   └── orders.js        # Rotas Express
    ├── controllers/
    │   └── orderController.js  # Validação de input + resposta HTTP
    ├── services/
    │   ├── orderService.js     # Lógica de negócio + transações SQL
    │   └── paymentService.js   # Simulação de pagamento (consumer usa isso)
    ├── messaging/
    │   ├── publisher.js     # Publica eventos no RabbitMQ
    │   └── consumer.js      # Consome e processa eventos da fila
    └── migrations/
        └── init.sql         # Schema inicial do banco (executado automaticamente)
```

---

## 🧪 Testando cenários

### Ver uma mensagem indo para a DLQ
O payment service tem 20% de chance de falha. Crie vários pedidos e observe nos logs e na DLQ do RabbitMQ.

### Derrubar e subir o RabbitMQ
```bash
docker-compose stop rabbitmq
# espere alguns segundos
docker-compose start rabbitmq
```
Observe a reconexão automática nos logs da aplicação.

### Ver os dados no banco diretamente
```bash
docker exec -it order_postgres psql -U orderuser -d orderdb -c "SELECT id, customer_name, status, total, created_at FROM orders;"
```

---

## 🔧 Parar os serviços

```bash
docker-compose down          # para e remove containers
docker-compose down -v       # também remove volumes (limpa banco e filas)
```
