const { Medication, Adherence, CaregiverPatient } = require('../models');
const logger = require('../utils/logger');
const sequelize = require('sequelize');
const { Op } = require('sequelize');

class MedicationController {
  // Helper to validate access to patient data
  async _validateAccess(req, targetUserId) {
    if (req.user.id === targetUserId) return true;
    if (['admin', 'healthcareprovider'].includes(req.user.role)) return true;
    
    if (req.user.role === 'caregiver') {
      const relation = await CaregiverPatient.findOne({
        where: { 
          caregiverId: req.user.id, 
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
   * Get all medications with pagination and optional filtering
   */
  async getMedications(req, res) {
    try {
      const { page = 1, limit = 20, status = 'active', search, patientId } = req.query;
      
      const targetUserId = patientId || req.user.id;
      if (patientId && !(await this._validateAccess(req, targetUserId))) {
        return res.status(403).json({ success: false, message: 'Access denied to patient data' });
      }

      const offset = (page - 1) * limit;
      const whereClause = { userId: targetUserId };

      if (status !== 'all') whereClause.isActive = status === 'active';
      if (search) whereClause.name = { [Op.iLike]: `%${search}%` };

      const { count, rows } = await Medication.findAndCountAll({
        where: whereClause,
        limit: parseInt(limit),
        offset: parseInt(offset),
        order: [['createdAt', 'DESC']]
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
      logger.error('Get medications error', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get a single medication by ID
   */
  async getMedication(req, res) {
    try {
      const { id } = req.params;
      const { patientId } = req.query;
      
      const targetUserId = patientId || req.user.id;

      if (patientId && !(await this._validateAccess(req, targetUserId))) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      const medication = await Medication.findOne({
        where: { id, userId: targetUserId }
      });

      if (!medication) {
        return res.status(404).json({ success: false, message: 'Medication not found' });
      }

      res.json({ success: true, data: medication });
    } catch (error) {
      logger.error('Get medication error', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Create a new medication
   */
  async createMedication(req, res) {
    try {
      // Default remaining quantity to total quantity if not provided
      const medData = {
        ...req.body,
        userId: req.user.id,
        remainingQuantity: req.body.remainingQuantity !== undefined 
          ? req.body.remainingQuantity 
          : req.body.totalQuantity
      };

      const medication = await Medication.create(medData);
      
      res.status(201).json({ success: true, data: medication });
    } catch (error) {
      logger.error('Create medication error', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Update a medication
   */
  async updateMedication(req, res) {
    try {
      const { id } = req.params;
      const medication = await Medication.findOne({ 
        where: { id, userId: req.user.id } 
      });

      if (!medication) {
        return res.status(404).json({ success: false, message: 'Medication not found' });
      }

      await medication.update(req.body);
      
      res.json({ success: true, data: medication });
    } catch (error) {
      logger.error('Update medication error', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Delete (deactivate) a medication
   */
  async deleteMedication(req, res) {
    try {
      const { id } = req.params;
      const medication = await Medication.findOne({ 
        where: { id, userId: req.user.id } 
      });

      if (!medication) {
        return res.status(404).json({ success: false, message: 'Medication not found' });
      }

      // Soft delete
      await medication.update({ isActive: false });
      
      res.json({ success: true, message: 'Medication deactivated' });
    } catch (error) {
      logger.error('Delete medication error', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get medications that need a refill
   */
  async getRefillNeeded(req, res) {
    try {
      const { patientId } = req.query;
      const targetUserId = patientId || req.user.id;

      if (patientId && !(await this._validateAccess(req, targetUserId))) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      const medications = await Medication.findAll({
        where: { userId: targetUserId, isActive: true }
      });

      const medicationsNeedingRefill = medications.filter(med => {
        const dailyDose = med.timesPerDay || 1;
        const threshold = dailyDose * 7; // Alert if less than 1 week supply
        return (med.remainingQuantity || 0) <= threshold;
      });

      res.json({
        success: true,
        data: medicationsNeedingRefill,
        count: medicationsNeedingRefill.length
      });
    } catch (error) {
      logger.error('Get refill needed error', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get upcoming doses for the next X hours
   */
  async getUpcomingDoses(req, res) {
    try {
      const { hours = 24, patientId } = req.query;
      const targetUserId = patientId || req.user.id;

      if (patientId && !(await this._validateAccess(req, targetUserId))) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      const medications = await Medication.findAll({
        where: { userId: targetUserId, isActive: true }
      });

      const upcomingDoses = [];
      const now = new Date();
      const limitTime = new Date(now.getTime() + hours * 60 * 60 * 1000);

      medications.forEach(med => {
         const intervalHours = 24 / (med.timesPerDay || 1);
         let nextDose = new Date(now.getTime() + intervalHours * 60 * 60 * 1000); 

         if (nextDose <= limitTime) {
             upcomingDoses.push({
               medicationId: med.id,
               medicationName: med.name,
               dosage: med.dosage + ' ' + med.dosageUnit,
               scheduledTime: nextDose,
               isRefillDue: med.remainingQuantity < 10
             });
         }
      });

      upcomingDoses.sort((a, b) => a.scheduledTime - b.scheduledTime);

      res.json({ success: true, data: upcomingDoses });
    } catch (error) {
      logger.error('Get upcoming doses error', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Refill a medication
   */
  async refillMedication(req, res) {
    try {
      const { id } = req.params;
      const { quantity } = req.body;

      const medication = await Medication.findOne({
        where: { id, userId: req.user.id }
      });

      if (!medication) {
        return res.status(404).json({ success: false, message: 'Medication not found' });
      }

      const newQuantity = (medication.remainingQuantity || 0) + parseInt(quantity);
      await medication.update({ remainingQuantity: newQuantity });

      res.json({ success: true, data: medication });
    } catch (error) {
      logger.error('Refill medication error', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }

  /**
   * Get general medication stats
   */
  async getMedicationStats(req, res) {
     try {
       const { patientId } = req.query;
       const targetUserId = patientId || req.user.id;

       if (patientId && !(await this._validateAccess(req, targetUserId))) {
         return res.status(403).json({ success: false, message: 'Access denied' });
       }

       const total = await Medication.count({ where: { userId: targetUserId, isActive: true } });
       const lowStock = await Medication.count({ 
          where: { 
             userId: targetUserId, 
             isActive: true, 
             remainingQuantity: { [Op.lte]: 10 } 
          } 
       });

       res.json({ success: true, data: { total, lowStock } });
     } catch (error) {
       logger.error('Get stats error', error);
       res.status(500).json({ success: false, message: error.message });
     }
  }

  /**
   * Generate schedule for calendar view
   */
  async generateSchedule(req, res) {
    try {
      const { days = 7, startDate, patientId } = req.query;
      const targetUserId = patientId || req.user.id;

      if (patientId && !(await this._validateAccess(req, targetUserId))) {
        return res.status(403).json({ success: false, message: 'Access denied' });
      }

      const start = startDate ? new Date(startDate) : new Date();
      const end = new Date(start);
      end.setDate(end.getDate() + parseInt(days));

      const medications = await Medication.findAll({
        where: { userId: targetUserId, isActive: true }
      });

      const schedule = [];
      
      // Simple generation logic for demo purposes
      // For each day in range
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dayStr = d.toISOString().split('T')[0];
        
        medications.forEach(med => {
          const times = med.timesPerDay || 1;
          const interval = 24 / times;
          
          for (let i = 0; i < times; i++) {
             // Basic logic: start at 8 AM + interval
             const hour = 8 + (i * interval);
             const doseTime = new Date(d);
             doseTime.setHours(hour, 0, 0, 0);
             
             schedule.push({
               id: `${med.id}-${dayStr}-${i}`, // Virtual ID
               title: `Take ${med.name}`,
               start: doseTime,
               end: new Date(doseTime.getTime() + 30 * 60000), // 30 min duration
               extendedProps: {
                 medicationId: med.id,
                 dosage: med.dosage + ' ' + med.dosageUnit,
                 status: 'scheduled'
               }
             });
          }
        });
      }

      res.json({ success: true, data: schedule });
    } catch (error) {
      logger.error('Generate schedule error', error);
      res.status(500).json({ success: false, message: error.message });
    }
  }
}

module.exports = new MedicationController();
