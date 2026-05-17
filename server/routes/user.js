const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const authMiddleware = require('../middleware/auth');

// POST /api/user/login - no auth required (user doesn't have a token yet)
router.post('/login', userController.login);

// GET /api/user/info - requires auth middleware
router.get('/info', authMiddleware, userController.getInfo);

module.exports = router;
