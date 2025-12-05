const express = require('express');
const router = express.Router();
const { Adherence, Medication, User } = require('../models');
const {authMiddleware} = require('../middleware/auth');
const {asyncHandler} = require('../middleware/errorHandler');
const { query, validationResult } = require('express-validator');
const PDFService = require('../services/pdfService');
const logger = require('../utils/logger');
const { Op } = require('sequelize');
 
/**
 * @route   GET /api/adherence/report/pdf
 * @desc    Generate a PDF adherence report for a given date range
 * @access  Private
 * @params  startDate (query), endDate (query) - YYYY-MM-DD format
 */
router.get(
  '/report/pdf',
  authMiddleware,
  [
    query('startDate', 'Invalid start date format').isISO8601(),
    query('endDate', 'Invalid end date format').isISO8601()
  ],
  asyncHandler(async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    try {
      const { startDate, endDate } = req.query;
      const userId = req.user.id;

      // 1. Fetch User Data
      const user = await User.findByPk(userId, { attributes: ['firstName', 'lastName'] });
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // 2. Fetch Adherence Records
      const start = new Date(startDate);
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999); // Ensure the whole end day is included

      const records = await Adherence.findAll({
        where: {
          userId,
          takenAt: { [Op.between]: [start, end] }
        },
        include: [{
          model: Medication,
          attributes: ['name']
        }],
        order: [['takenAt', 'ASC']]
      });

      // 3. Calculate Statistics
      const total = records.length;
      const missed = records.filter(r => r.status === 'missed').length;
      const taken = total - missed;
      const rate = total > 0 ? `${Math.round((taken / total) * 100)}%` : '0%';

      const adherenceData = { rate, total, missed, history: records };

      // 4. Generate PDF using the existing service
      const pdfBuffer = await PDFService.generateReport(user, adherenceData, startDate, endDate);

      // 5. Send PDF as response
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Length': pdfBuffer.length,
        'Content-Disposition': `attachment; filename="CareSync_Adherence_Report_${startDate}_to_${endDate}.pdf"`
      });

      res.send(pdfBuffer);
      logger.info(`Successfully generated PDF report for user ${userId}`);

    } catch (error) {
      logger.error('Failed to generate PDF report', error);
      res.status(500).json({ success: false, message: 'An error occurred while generating the report.' });
    }
  })
);

module.exports = router;
