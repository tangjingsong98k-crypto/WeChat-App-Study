const express = require('express');
const router = express.Router();
const rankingController = require('../controllers/rankingController');
const authMiddleware = require('../middleware/auth');

// All ranking routes require authentication
router.get('/all', authMiddleware, rankingController.getAll);
router.get('/friends', authMiddleware, rankingController.getFriends);
router.post('/toggle', authMiddleware, rankingController.toggle);

module.exports = router;
