const express = require("express");
const router = express.Router();
const multer = require("multer");
const medicationController = require("../controllers/medicationController");
const { authMiddleware } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/errorHandler");
const {
  handleValidationErrors,
} = require("../middleware/validationMiddleware");
const { body, query, param } = require("express-validator");

// Multer — memory storage so we get a Buffer for the parser
const prescriptionUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Only PDF files are allowed"), false);
  },
});

// --- VALIDATION RULES ---

// Time guards: doses can only be marked as taken in a tight window around
// "now". Allowing arbitrary future timestamps would let a malicious or
// buggy client backfill non-existent doses ("time-traveling doses"), which
// inflates adherence and corrupts inventory.
const FUTURE_DOSE_GRACE_MINUTES = 60; // can mark up to 60 min before scheduled
const TAKEN_AT_FUTURE_SKEW_MINUTES = 5; // tolerance for client/server clock drift

const validateMedication = [
  body("name").trim().notEmpty().withMessage("Medication name is required"),
  body("dosage")
    .notEmpty()
    .withMessage("Dosage is required")
    .bail()
    .isFloat({ gt: 0 })
    .withMessage("Dosage must be greater than 0"),
  body("dosageUnit").trim().notEmpty().withMessage("Dosage unit is required"),
  body("frequency").optional().trim(),
  body("timesPerDay")
    .optional()
    .isInt({ min: 1, max: 24 })
    .withMessage("timesPerDay must be between 1 and 24"),
  // Zero-quantity prescriptions are nonsensical and break the inventory
  // state machine. If the user has no stock, the medication shouldn't
  // exist yet — they should add it after they pick up the refill.
  body("totalQuantity")
    .optional({ nullable: true })
    .isInt({ min: 1 })
    .withMessage("totalQuantity must be at least 1"),
  body("startDate").optional().isISO8601(),
  body("endDate")
    .optional({ nullable: true })
    .isISO8601()
    .withMessage("Invalid endDate"),
  body("isPRN").optional().isBoolean().withMessage("isPRN must be boolean"),
  // Mandatory endDate enforcement when not PRN — prevents the
  // "infinite calendar pollution" edge case.
  body().custom((body) => {
    const isPRN = body.isPRN === true || body.isPRN === "true";
    if (!isPRN && (body.endDate == null || body.endDate === "")) {
      throw new Error(
        "endDate is required unless the medication is marked as PRN / As Needed",
      );
    }
    if (body.startDate && body.endDate) {
      const start = new Date(body.startDate).getTime();
      const end = new Date(body.endDate).getTime();
      if (Number.isNaN(start) || Number.isNaN(end)) return true; // delegated to ISO8601 above
      if (end < start) {
        throw new Error("endDate must be on or after startDate");
      }
    }
    return true;
  }),
];

const validateAdherenceRecord = [
  body("medicationId").isUUID().withMessage("Invalid medication ID"),
  body("status")
    .isIn(["taken", "skipped", "missed", "late", "early"])
    .withMessage("Invalid status"),
  body("takenAt")
    .optional({ values: "null" })
    .isISO8601()
    .withMessage("Invalid taken time"),
  body("scheduledTime").isISO8601().withMessage("Invalid scheduled time"),
  // Time-traveling dose guard. Even though the frontend SchedulePage
  // disables the "Mark Taken" button for future slots, a malicious or
  // buggy client can still POST directly. The backend MUST be the source
  // of truth here — patient safety depends on it.
  body().custom((body) => {
    const now = Date.now();
    if (body.scheduledTime) {
      const sched = new Date(body.scheduledTime).getTime();
      if (!Number.isNaN(sched)) {
        const futureLimit = now + FUTURE_DOSE_GRACE_MINUTES * 60 * 1000;
        if (sched > futureLimit) {
          throw new Error(
            `Cannot record a dose more than ${FUTURE_DOSE_GRACE_MINUTES} minutes in the future`,
          );
        }
      }
    }
    if (body.takenAt && body.status === "taken") {
      const taken = new Date(body.takenAt).getTime();
      if (!Number.isNaN(taken)) {
        const skewLimit = now + TAKEN_AT_FUTURE_SKEW_MINUTES * 60 * 1000;
        if (taken > skewLimit) {
          throw new Error("takenAt cannot be in the future");
        }
      }
    }
    return true;
  }),
];

// ==========================================
// 1. SPECIFIC ROUTES (Must come first!)
// ==========================================

/**
 * @swagger
 * /api/medications/schedule:
 *   get:
 *     tags: [Medications]
 *     summary: Get calendar data for medications
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: patientId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Calendar data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     calendar:
 *                       type: array
 *                       items:
 *                         type: object
 *                     dateRange:
 *                       type: object
 */
// Matches GET /api/medications/schedule
// (Moved to top so "schedule" isn't treated as an :id)
router.get(
  "/schedule",
  authMiddleware,
  asyncHandler(medicationController.getCalendarData.bind(medicationController)),
);

/**
 * @swagger
 * /api/medications/adherence:
 *   post:
 *     tags: [Medications]
 *     summary: Record adherence
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               medicationId:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [taken, skipped, missed, late, early]
 *               takenAt:
 *                 type: string
 *                 format: date-time
 *               scheduledTime:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Adherence recorded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 */
// Matches POST /api/medications/adherence
router.post(
  "/adherence",
  authMiddleware,
  validateAdherenceRecord,
  handleValidationErrors,
  asyncHandler(medicationController.recordAdherence.bind(medicationController)),
);

/**
 * @swagger
 * /api/medications/adherence:
 *   get:
 *     tags: [Medications]
 *     summary: Get adherence records for medications
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: medicationId
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: patientId
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Adherence records retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 */
// Matches GET /api/medications/adherence
router.get(
  "/adherence",
  authMiddleware,
  asyncHandler(
    medicationController.getAdherenceRecords.bind(medicationController),
  ),
);

/**
 * @swagger
 * /api/medications/adherence/stats:
 *   get:
 *     tags: [Medications]
 *     summary: Get adherence statistics
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: period
 *         schema:
 *           type: string
 *       - in: query
 *         name: patientId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Adherence statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     rate:
 *                       type: number
 *                     total:
 *                       type: number
 *                     taken:
 *                       type: number
 *                     missed:
 *                       type: number
 *                     skipped:
 *                       type: number
 *                     period:
 *                       type: string
 */
// Matches GET /api/medications/adherence/stats
router.get(
  "/adherence/stats",
  authMiddleware,
  asyncHandler(
    medicationController.getAdherenceStats.bind(medicationController),
  ),
);

// ==========================================
// 2. GENERIC / PARAMETER ROUTES (Must come last!)
// ==========================================

// Core Medication CRUD
/**
 * @swagger
 * /api/medications:
 *   get:
 *     tags: [Medications]
 *     summary: Get all medications with pagination and optional filtering
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: patientId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of medications retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                 pagination:
 *                   type: object
 */
router.get(
  "/",
  authMiddleware,
  asyncHandler(medicationController.getMedications.bind(medicationController)),
);

/**
 * @swagger
 * /api/medications:
 *   post:
 *     tags: [Medications]
 *     summary: Create a new medication
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               dosage:
 *                 type: string
 *               dosageUnit:
 *                 type: string
 *               frequency:
 *                 type: string
 *               timesPerDay:
 *                 type: integer
 *               totalQuantity:
 *                 type: integer
 *               startDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       201:
 *         description: Medication created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 */
router.post(
  "/",
  authMiddleware,
  validateMedication,
  handleValidationErrors,
  asyncHandler(
    medicationController.createMedication.bind(medicationController),
  ),
);

router.post(
  "/pem-scan",
  authMiddleware,
  body("qrData").notEmpty().withMessage("QR Data string is required"),
  handleValidationErrors,
  asyncHandler(medicationController.processPemScan.bind(medicationController)),
);

// SNS Prescription PDF parser
router.post(
  "/parse-prescription",
  authMiddleware,
  prescriptionUpload.single("prescription"),
  asyncHandler(
    medicationController.parsePrescription.bind(medicationController),
  ),
);

// :id routes match ANYTHING, so keep them at the bottom
/**
 * @swagger
 * /api/medications/{id}:
 *   get:
 *     tags: [Medications]
 *     summary: Get a specific medication
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: patientId
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Medication retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 */
router.get(
  "/:id",
  authMiddleware,
  asyncHandler(medicationController.getMedication.bind(medicationController)),
);

/**
 * @swagger
 * /api/medications/{id}:
 *   put:
 *     tags: [Medications]
 *     summary: Update a medication
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               dosage:
 *                 type: string
 *               dosageUnit:
 *                 type: string
 *               frequency:
 *                 type: string
 *               timesPerDay:
 *                 type: integer
 *               totalQuantity:
 *                 type: integer
 *               startDate:
 *                 type: string
 *                 format: date
 *     responses:
 *       200:
 *         description: Medication updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 */
router.put(
  "/:id",
  authMiddleware,
  validateMedication,
  handleValidationErrors,
  asyncHandler(
    medicationController.updateMedication.bind(medicationController),
  ),
);

/**
 * @swagger
 * /api/medications/{id}:
 *   delete:
 *     tags: [Medications]
 *     summary: Delete a medication
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Medication deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 */
router.delete(
  "/:id",
  authMiddleware,
  asyncHandler(
    medicationController.deleteMedication.bind(medicationController),
  ),
);

module.exports = router;
