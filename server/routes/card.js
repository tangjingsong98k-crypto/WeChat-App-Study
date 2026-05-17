const express = require('express');
const router = express.Router();
const cardController = require('../controllers/cardController');
const authMiddleware = require('../middleware/auth');

// All card routes require authentication
router.get('/', authMiddleware, cardController.getCards);
router.get('/sets', authMiddleware, cardController.getSets);

module.exports = router;
