const { Router } = require('express');
const { create, list, getById } = require('../controllers/orderController');

const router = Router();

// GET  /orders        → lista todos os pedidos
router.get('/', list);

// GET  /orders/:id    → busca pedido por ID
router.get('/:id', getById);

// POST /orders        → cria novo pedido
router.post('/', create);

module.exports = router;
