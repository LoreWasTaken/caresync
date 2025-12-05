const { Adherence, Medication, CaregiverPatient } = require('../models');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

class AdherenceController {
  /**
   * Helper to validate if the requesting user has access to the target patient's data.
   * Returns true if:
   * 1. User is requesting their own data.
   * 2. User is an admin or healthcare provider.
   * 3. User is a verified, active caregiver for the patient.
   */
  async _validateAccess(requestingUser, targetUserId) {
    // 1. Check if user is requesting their own data
    if (requestingUser.id === targetUserId) return true;

    // 2. Check role-based broad access
    if (['admin', 'healthcareprovider'].includes(requestingUser.role)) return true;

    // 3. Check Caregiver relationship
    if (requestingUser.role === 'caregiver') {
      const relation = await CaregiverPatient.findOne({
        where: {
          caregiverId: requestingUser.id,
          patientId: targetUserId,
          isActive: true,
          isVerified: true
        }
      });
      return !!relation;
    }

    return false;
  }

  /**
   * Get adherence records with optional filtering and patient access.
   * Route: GET /
   */
  async getAdherenceRecords(req, res) {
    try {
      const { page = 1, limit = 20, startDate, endDate, medicationId, patientId } = req.query;
      
      // Determine target user
      const targetUserId = patientId || req.user.id;

      // Validate Access
      const hasAccess = await this._validateAccess(req.user, targetUserId);
      if (!hasAccess) {
        return res.status(403).json({ success: false, message: 'Access denied to patient data.' });
      }

      const offset = (page - 1) * limit;
      const whereClause = { userId: targetUserId };

      if (startDate && endDate) {
        whereClause.takenAt = { [Op.between]: [new Date(startDate), new Date(endDate)] };
      }

      if (medicationId) {
        whereClause.medicationId = medicationId;
      }

      const { count, rows } = await Adherence.findAndCountAll({
        where: whereClause,
        include: [{
          model: Medication,
          attributes: ['id', 'name', 'dosage', 'dosageUnit']
        }],
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['takenAt', 'DESC']]
      });

      res.json({
        success: true,
        data: rows,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(count / limit),
          totalItems: count,
          itemsPerPage: parseInt(limit)
        }
      });
    } catch (error) {
      logger.error('Get adherence records error', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get single adherence record.
   * Route: GET /:id
   */
  async getAdherenceRecord(req, res) {
    try {
      const { id } = req.params;
      
      // Note: For single records, we first find the record to know who it belongs to
      const record = await Adherence.findOne({
        where: { id },
        include: [{
          model: Medication,
          attributes: ['id', 'name', 'dosage', 'dosageUnit']
        }]
      });

      if (!record) {
        return res.status(404).json({ success: false, message: 'Adherence record not found' });
      }

      // Validate Access to this specific record's owner
      const hasAccess = await this._validateAccess(req.user, record.userId);
      if (!hasAccess) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }

      res.json({ success: true, data: record });
    } catch (error) {
      logger.error('Get adherence record error', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Record new adherence (taken/skipped).
   * Route: POST /
   */
  async recordAdherence(req, res) {
    try {
      const { medicationId, status, takenAt, scheduledTime } = req.body;
      // We assume recording is done for the logged-in user (Patient)
      // If a caregiver records it, we might need to pass patientId in body, 
      // but standard flow is patient self-reporting.
      
      const intake = await Adherence.create({
        userId: req.user.id,
        medicationId,
        status: status || 'taken',
        takenAt: takenAt || new Date(),
        scheduledTime: scheduledTime || new Date()
      });

      // Update medication stock if taken
      if (status === 'taken') {
        const med = await Medication.findByPk(medicationId);
        if (med) {
          await med.decrement('remainingQuantity', { by: 1 });
        }
      }

      res.status(201).json({
        success: true,
        message: 'Adherence recorded successfully',
        data: intake
      });
    } catch (error) {
      logger.error('Record adherence error', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Update existing adherence record.
   * Route: PUT /:id
   */
  async updateAdherenceRecord(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;

      const record = await Adherence.findByPk(id);

      if (!record) {
        return res.status(404).json({ success: false, message: 'Adherence record not found' });
      }

      // Only allow user to update their own records
      if (record.userId !== req.user.id) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      await record.update(updates);

      res.json({ success: true, message: 'Adherence record updated', data: record });
    } catch (error) {
      logger.error('Update adherence record error', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get adherence statistics (rates, counts) with patientId support.
   * Route: GET /stats
   */
  async getAdherenceStats(req, res) {
    try {
      const { startDate, endDate, period = 'month', patientId } = req.query;
      
      // Determine target user
      const targetUserId = patientId || req.user.id;

      // Validate Access
      const hasAccess = await this._validateAccess(req.user, targetUserId);
      if (!hasAccess) {
        return res.status(403).json({ success: false, message: 'Access denied to patient data.' });
      }

      const whereClause = { userId: targetUserId };

      // Date Filtering
      if (startDate && endDate) {
        whereClause.takenAt = { [Op.between]: [new Date(startDate), new Date(endDate)] };
      } else {
        // Default to last 30 days
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        whereClause.takenAt = { [Op.between]: [thirtyDaysAgo, now] };
      }

      // Fetch all records for calculation
      const adherenceRecords = await Adherence.findAll({
        where: whereClause,
        include: [{
          model: Medication,
          attributes: ['name']
        }]
      });

      // Calculate Stats
      const total = adherenceRecords.length;
      const taken = adherenceRecords.filter(r => r.status === 'taken').length;
      const missed = adherenceRecords.filter(r => r.status === 'missed').length;
      const skipped = adherenceRecords.filter(r => r.status === 'skipped').length;
      const rate = total > 0 ? Math.round((taken / total) * 100) : 0;

      res.json({
        success: true,
        data: {
          rate,
          total,
          taken,
          missed,
          skipped,
          period
        }
      });
    } catch (error) {
      logger.error('Get adherence stats error', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get adherence trends over time.
   * Route: GET /trends
   */
  async getAdherenceTrends(req, res) {
    try {
      const { days = 30, patientId } = req.query;
      
      // Determine target user
      const targetUserId = patientId || req.user.id;

      // Validate Access
      const hasAccess = await this._validateAccess(req.user, targetUserId);
      if (!hasAccess) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(days));

      const records = await Adherence.findAll({
        where: {
          userId: targetUserId,
          takenAt: { [Op.gte]: startDate }
        },
        attributes: ['takenAt', 'status'],
        order: [['takenAt', 'ASC']]
      });

      // Group by date
      const trends = records.reduce((acc, record) => {
        const date = new Date(record.takenAt).toISOString().split('T')[0];
        if (!acc[date]) {
          acc[date] = { date, taken: 0, missed: 0, total: 0 };
        }
        
        acc[date].total++;
        if (record.status === 'taken') acc[date].taken++;
        if (record.status === 'missed') acc[date].missed++;
        
        return acc;
      }, {});

      const trendsArray = Object.values(trends).map(day => ({
        ...day,
        rate: day.total > 0 ? Math.round((day.taken / day.total) * 100) : 0
      }));

      res.json({ success: true, data: trendsArray });
    } catch (error) {
      logger.error('Get trends error', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get adherence stats specific to one medication.
   * Route: GET /medication/:medicationId
   */
  async getMedicationAdherence(req, res) {
    try {
      const { medicationId } = req.params;
      const { startDate, endDate, patientId } = req.query;

      const targetUserId = patientId || req.user.id;

      // Validate Access
      const hasAccess = await this._validateAccess(req.user, targetUserId);
      if (!hasAccess) {
        return res.status(403).json({ success: false, message: 'Access denied.' });
      }

      const whereClause = {
        userId: targetUserId,
        medicationId
      };

      if (startDate && endDate) {
        whereClause.takenAt = { [Op.between]: [new Date(startDate), new Date(endDate)] };
      }

      const records = await Adherence.findAll({
        where: whereClause,
        include: [{
          model: Medication,
          attributes: ['id', 'name', 'dosage', 'dosageUnit']
        }],
        order: [['takenAt', 'DESC']]
      });

      const total = records.length;
      const taken = records.filter(r => r.status === 'taken').length;
      const rate = total > 0 ? Math.round((taken / total) * 100) : 0;

      res.json({
        success: true,
        data: {
          medicationId,
          records,
          stats: { total, taken, rate }
        }
      });
    } catch (error) {
      logger.error('Get medication adherence error', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Bulk record adherence (e.g., from device sync).
   * Route: POST /bulk
   */
  async bulkRecordAdherence(req, res) {
    try {
      const { records } = req.body;
      
      if (!Array.isArray(records) || records.length === 0) {
        return res.status(400).json({ success: false, message: 'Records array is required' });
      }

      const adherenceRecords = records.map(record => ({
        ...record,
        userId: req.user.id,
        takenAt: record.takenAt || new Date()
      }));

      const created = await Adherence.bulkCreate(adherenceRecords);

      res.status(201).json({
        success: true,
        message: `${created.length} records created`,
        data: created
      });
    } catch (error) {
      logger.error('Bulk record adherence error', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

// Make sure to bind methods if passing them as callbacks, 
// or export an instance where methods are called on the instance.
module.exports = new AdherenceController();
