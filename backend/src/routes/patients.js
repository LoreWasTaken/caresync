const express = require('express');
const router = express.Router();
const caregiverController = require('../controllers/caregiverController');

// Existing routes
router.get('/', caregiverController.getPatients);

module.exports = router;
