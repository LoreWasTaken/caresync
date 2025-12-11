const express = require('express');
const router = express.Router();
const medicationController = require('../controllers/medicationController');
const { authMiddleware, requirePatientAccess } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler')
const { body, query, param, validationResult } = require('express-validator');

// Validation middleware
const validateMedicationCreation = [
  body('name').notEmpty().trim().withMessage('Medication name is required'),
  body('dosage').notEmpty().trim().withMessage('Dosage is required'),
  body('dosageUnit').isIn(['mg', 'ml', 'tablets', 'capsules', 'drops', 'units', 'puffs']).withMessage('Invalid dosage unit'),
  body('timesPerDay').isInt({ min: 1, max: 24 }).withMessage('Times per day must be between 1 and 24'),
  body('frequency').optional().isString().withMessage('Frequency must be a string'),
  // Keep backward compatibility: allow optional nested frequency.timesPerDay/times but don’t require them
  body('frequency.timesPerDay').optional().isInt({ min: 1, max: 24 }).withMessage('Times per day must be between 1 and 24'),
  body('frequency.times').optional().isArray().withMessage('Times must be an array'),
  body('startDate').isISO8601().withMessage('Invalid start date'),
  body('endDate').optional().isISO8601().withMessage('Invalid end date'),
  body('totalQuantity').isInt({ min: 1 }).withMessage('Total quantity must be a positive integer'),
  body('remainingQuantity').optional().isInt({ min: 0 }).withMessage('Remaining quantity must be non-negative')
];

const validateMedicationUpdate = [
  param('id').isUUID().withMessage('Invalid medication ID'),
  body('name').optional().trim().isLength({ min: 2 }).withMessage('Medication name must be at least 2 characters'),
  body('dosage').optional().trim().isLength({ min: 1 }).withMessage('Dosage is required'),
  body('dosageUnit').optional().isIn(['mg', 'ml', 'tablets', 'capsules', 'drops', 'units', 'puffs']).withMessage('Invalid dosage unit'),
  body('totalQuantity').optional().isInt({ min: 1 }).withMessage('Total quantity must be a positive integer'),
  body('remainingQuantity').optional().isInt({ min: 0 }).withMessage('Remaining quantity must be non-negative'),
  body('frequency.timesPerDay').optional().isInt({ min: 1, max: 24 }).withMessage('Times per day must be between 1 and 24')
];

const validateRefill = [
  param('id').isUUID().withMessage('Invalid medication ID'),
  body('quantity').isInt({ min: 1 }).withMessage('Refill quantity must be a positive integer'),
  body('refillsRemaining').optional().isInt({ min: 0 }).withMessage('Refills remaining must be non-negative')
];

const validatePagination = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  query('status').optional().isIn(['active', 'inactive', 'all']).withMessage('Invalid status'),
  query('search').optional().trim().isLength({ max: 100 }).withMessage('Search term too long')
];

const validateMedicationId = [
  param('id').isUUID().withMessage('Invalid medication ID')
];

const validateUpcomingDoses = [
  query('hours').optional().isInt({ min: 1, max: 168 }).withMessage('Hours must be between 1 and 168 (1 week)')
];

const validatePatientAccess = [
  requirePatientAccess
];

// Validation handler
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

// Routes

// @desc    Get all medications for user
// @route   GET /api/medications
// @access  Private
router.get('/', authMiddleware, validatePagination, handleValidationErrors, asyncHandler(medicationController.getMedications.bind(medicationController)));

// @desc    Get single medication
// @route   GET /api/medications/:id
// @access  Private
router.get('/:id', authMiddleware, validateMedicationId, validatePatientAccess, handleValidationErrors, asyncHandler(medicationController.getMedication.bind(medicationController)));

// @desc    Create new medication
// @route   POST /api/medications
// @access  Private
router.post('/', authMiddleware, validateMedicationCreation, handleValidationErrors, asyncHandler(medicationController.createMedication.bind(medicationController)));

// @desc    Update medication
// @route   PUT /api/medications/:id
// @access  Private
router.put('/:id', authMiddleware, validateMedicationUpdate, validatePatientAccess, handleValidationErrors, asyncHandler(medicationController.updateMedication.bind(medicationController)));

// @desc    Delete medication
// @route   DELETE /api/medications/:id
// @access  Private
router.delete('/:id', authMiddleware, validateMedicationId, validatePatientAccess, handleValidationErrors, asyncHandler(medicationController.deleteMedication.bind(medicationController)));

// @desc    Get medications needing refill
// @route   GET /api/medications/refill-needed
// @access  Private
router.get('/refill-needed', authMiddleware, handleValidationErrors, asyncHandler(medicationController.getRefillNeeded.bind(medicationController)));

// @desc    Get upcoming doses
// @route   GET /api/medications/upcoming-doses
// @access  Private
router.get('/upcoming-doses', authMiddleware, validateUpcomingDoses, handleValidationErrors, asyncHandler(medicationController.getUpcomingDoses.bind(medicationController)));

// @desc    Refill medication
// @route   POST /api/medications/:id/refill
// @access  Private
router.post('/:id/refill', authMiddleware, validateRefill, validatePatientAccess, handleValidationErrors, asyncHandler(medicationController.refillMedication.bind(medicationController)));

// @desc    Get medication statistics
// @route   GET /api/medications/stats
// @access  Private
router.get('/stats', authMiddleware, handleValidationErrors, asyncHandler(medicationController.getMedicationStats.bind(medicationController)));
// @desc    Generate medication schedule
// @route   GET /api/medications/schedule
// @access  Private
router.get('/schedule', authMiddleware, [
  query('days').optional().isInt({ min: 1, max: 30 }).withMessage('Days must be between 1 and 30'),
  query('startDate').optional().isISO8601().withMessage('Invalid start date')
], handleValidationErrors, asyncHandler(medicationController.generateSchedule.bind(medicationController)));

module.exports = router;
