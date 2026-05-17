const express = require('express');
const router = express.Router();
const treeController = require('../controllers/treeController');
const authMiddleware = require('../middleware/auth');

// All tree routes require authentication
router.post('/select', authMiddleware, treeController.select);
router.post('/water', authMiddleware, treeController.water);
router.post('/fertilize', authMiddleware, treeController.fertilize);
router.get('/status', authMiddleware, treeController.getStatus);

module.exports = router;
