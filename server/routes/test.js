const express = require('express');
const router = express.Router();
const testController = require('../controllers/testController');

// No auth required for test endpoints (development/testing only)
router.post('/fake-user', testController.createFakeUser);
router.post('/refill', testController.refill);

module.exports = router;
