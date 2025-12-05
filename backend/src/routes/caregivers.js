const express = require('express');
const router = express.Router();
const caregiverController = require('../controllers/caregiverController');

// Existing routes
router.get('/', caregiverController.getCaregivers);
router.post('/invite', caregiverController.inviteCaregiver);
router.delete('/:id', caregiverController.removeCaregiver);

// ADD THESE NEW ROUTES:
router.get('/pending', caregiverController.getPendingInvitations);
router.post('/:id/accept', caregiverController.acceptInvitation);
router.post('/:id/decline', caregiverController.declineInvitation);

module.exports = router;
