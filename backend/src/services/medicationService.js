const { Medication, Adherence, CaregiverPatient } = require('../models');
const logger = require('../utils/logger');
const { Op } = require('sequelize');
const { AppError, AuthorizationError, NotFoundError } = require('../middleware/errorHandler');

class MedicationService {

  // ==========================================
  // HELPER METHODS
  // ==========================================

  /**
   * Helper to validate if the requesting user has access to the target patient's data.
   */
  async _validateAccess(requestingUser, targetUserId) {
    if (requestingUser.id === targetUserId) return true;
    if (['admin', 'healthcareprovider'].includes(requestingUser.role)) return true;

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
   * Determine medication status based on scheduled time and taken time
   */
  _determineMedicationStatus(scheduledTime, takenAt, status) {
    if (status === 'skipped') return 'skipped';
    if (!takenAt) return 'missed';

    const scheduled = new Date(scheduledTime);
    const taken = new Date(takenAt);
    const diffMinutes = (taken - scheduled) / (1000 * 60);

    // Window logic: +/- 15 mins is "On Time" (taken)
    if (diffMinutes > 15) return 'late';
    if (diffMinutes < -15) return 'early';
    
    return 'taken';
  }

  // ==========================================
  // CORE MEDICATION CRUD
  // ==========================================

  /**
   * Get all medications with pagination and optional filtering
   */
  async getMedications(user, query) {
    const { page = 1, limit = 20, status = 'active', search, patientId } = query;
    
    const targetUserId = patientId || user.id;
    if (!(await this._validateAccess(user, targetUserId))) {
      throw new AuthorizationError('Access denied to patient data');
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

    return {
      medications: rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      }
    };
  }

  async getMedication(user, id, patientId) {
    const targetUserId = patientId || user.id;

    if (!(await this._validateAccess(user, targetUserId))) {
      throw new AuthorizationError('Access denied');
    }

    const medication = await Medication.findOne({
      where: { id, userId: targetUserId }
    });

    if (!medication) throw new AppError('Medication not found', 404);

    return medication;
  }

  async createMedication(user, medData) {
    const medicationData = {
      ...medData,
      userId: user.id,
      remainingQuantity: medData.remainingQuantity !== undefined 
        ? medData.remainingQuantity 
        : medData.totalQuantity
    };

    const medication = await Medication.create(medicationData);
    return medication;
  }

  async updateMedication(user, id, medData) {
    const medication = await Medication.findOne({ 
      where: { id, userId: user.id } 
    });

    if (!medication) throw new AppError('Medication not found', 404);

    await medication.update(medData);
    return medication;
  }

  async deleteMedication(user, id) {
    const medication = await Medication.findOne({
      where: { id, userId: user.id }
    });

    if (!medication) throw new AppError('Medication not found', 404);

    // GDPR Art. 17 — hard delete with cascade to adherence records
    await Adherence.destroy({ where: { medicationId: medication.id } });
    await medication.destroy();
    return { success: true, message: 'Medication permanently deleted' };
  }

  // ==========================================
  // ADHERENCE LOGIC
  // ==========================================

  async getAdherenceRecords(user, query) {
    const { page = 1, limit = 20, startDate, endDate, medicationId, patientId } = query;
    const targetUserId = patientId || user.id;

    if (!(await this._validateAccess(user, targetUserId))) {
      throw new AuthorizationError('Access denied to patient data.');
    }

    const offset = (page - 1) * limit;
    const whereClause = { userId: targetUserId };

    if (startDate && endDate) {
      whereClause.takenAt = { [Op.between]: [new Date(startDate), new Date(endDate)] };
    }

    if (medicationId) whereClause.medicationId = medicationId;

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

    return {
      adherenceRecords: rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: parseInt(limit)
      }
    };
  }

  async recordAdherence(user, adherenceData) {
    const { medicationId, status, takenAt, scheduledTime } = adherenceData;

    // IDOR fix: verify medication belongs to the authenticated user
    const med = await Medication.findOne({ where: { id: medicationId, userId: user.id } });
    if (!med) {
      throw new NotFoundError('Medication not found');
    }

    const intake = await Adherence.create({
      userId: user.id,
      medicationId,
      status: status || 'taken',
      takenAt: takenAt || new Date(),
      scheduledTime: scheduledTime || new Date()
    });

    // Update medication stock
    if (status === 'taken') {
      await med.decrement('remainingQuantity', { by: 1 });
    }

    return intake;
  }

  async getAdherenceStats(user, query) {
    const { startDate, endDate, period = 'month', patientId } = query;
    const targetUserId = patientId || user.id;

    if (!(await this._validateAccess(user, targetUserId))) {
      throw new AuthorizationError('Access denied to patient data.');
    }

    const whereClause = { userId: targetUserId };

    if (startDate && endDate) {
      whereClause.takenAt = { [Op.between]: [new Date(startDate), new Date(endDate)] };
    } else {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
      whereClause.takenAt = { [Op.between]: [thirtyDaysAgo, now] };
    }

    const adherenceRecords = await Adherence.findAll({
      where: whereClause,
      include: [{ model: Medication, attributes: ['name'] }]
    });

    const total = adherenceRecords.length;
    const taken = adherenceRecords.filter(r => r.status === 'taken').length;
    const missed = adherenceRecords.filter(r => r.status === 'missed').length;
    const skipped = adherenceRecords.filter(r => r.status === 'skipped').length;
    const rate = total > 0 ? Math.round((taken / total) * 100) : 0;

    return { rate, total, taken, missed, skipped, period };
  }

  // ==========================================
  // CALENDAR / SCHEDULE LOGIC
  // ==========================================

  /**
   * Generate a full calendar schedule from the MEDICATION definitions,
   * enriched with any existing Adherence records.
   *
   * Previous implementation only read from the Adherence table, which
   * returned an empty calendar when no doses had been recorded yet.
   */
  async getCalendarData(user, query) {
    const { startDate, endDate, patientId } = query;
    const targetUserId = patientId || user.id;

    if (!(await this._validateAccess(user, targetUserId))) {
      throw new AuthorizationError('Access denied to patient data.');
    }

    const now = new Date();
    const queryStartDate = startDate ? new Date(startDate) : new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
    const queryEndDate = endDate ? new Date(endDate) : now;

    // 1. Fetch all active medications whose date range overlaps the query window.
    //    startDate & endDate are plain DATE columns (not encrypted) so we can filter in SQL.
    const medications = await Medication.findAll({
      where: {
        userId: targetUserId,
        isActive: true,
        startDate: { [Op.lte]: queryEndDate },
        [Op.or]: [
          { endDate: null },
          { endDate: { [Op.gte]: queryStartDate } }
        ]
      },
      order: [['createdAt', 'ASC']]
    });

    // 2. Fetch existing adherence records for the same window (for real status).
    const adherenceRecords = await Adherence.findAll({
      where: {
        userId: targetUserId,
        scheduledTime: { [Op.between]: [queryStartDate, queryEndDate] }
      },
      order: [['scheduledTime', 'ASC']]
    });

    // Index adherence by medicationId + YYYY-MM-DD for O(1) lookup
    const adherenceMap = {};
    adherenceRecords.forEach(record => {
      const date = new Date(record.scheduledTime).toISOString().split('T')[0];
      const key = `${record.medicationId}_${date}`;
      if (!adherenceMap[key]) adherenceMap[key] = [];
      adherenceMap[key].push(record);
    });

    // 3. Generate schedule entries from medication master data.
    const calendarData = {};

    for (const med of medications) {
      const medStart = new Date(med.startDate);
      const medEnd = med.endDate ? new Date(med.endDate) : queryEndDate;
      const frequency = (med.frequency || 'daily').toLowerCase().trim();
      const timesPerDay = med.timesPerDay || 1;

      // Effective range = intersection of medication dates & query dates
      const effectiveStart = new Date(Math.max(medStart.getTime(), queryStartDate.getTime()));
      const effectiveEnd = new Date(Math.min(medEnd.getTime(), queryEndDate.getTime()));

      const current = new Date(effectiveStart);
      current.setHours(0, 0, 0, 0);

      const endCheck = new Date(effectiveEnd);
      endCheck.setHours(23, 59, 59, 999);

      while (current <= endCheck) {
        const dateStr = current.toISOString().split('T')[0];

        if (this._shouldScheduleOnDay(current, medStart, frequency)) {
          if (!calendarData[dateStr]) calendarData[dateStr] = [];

          const key = `${med.id}_${dateStr}`;
          const existingRecords = adherenceMap[key] || [];

          if (existingRecords.length > 0) {
            // Real adherence data exists — use it
            existingRecords.forEach(record => {
              calendarData[dateStr].push({
                id: record.id,
                medicationId: record.medicationId,
                name: med.name || 'Unknown Medication',
                dosage: `${med.dosage || ''} ${med.dosageUnit || ''}`.trim(),
                compartment: med.compartment || null,
                scheduledTime: record.scheduledTime,
                takenAt: record.takenAt,
                status: this._determineMedicationStatus(record.scheduledTime, record.takenAt, record.status)
              });
            });
          } else {
            // No adherence yet — generate placeholder entries
            for (let t = 0; t < timesPerDay; t++) {
              const hour = this._getScheduledHour(t, timesPerDay);
              const scheduledTime = new Date(current);
              scheduledTime.setHours(hour, 0, 0, 0);

              const isPast = scheduledTime < now;

              calendarData[dateStr].push({
                id: null,
                medicationId: med.id,
                name: med.name || 'Unknown Medication',
                dosage: `${med.dosage || ''} ${med.dosageUnit || ''}`.trim(),
                compartment: med.compartment || null,
                scheduledTime: scheduledTime.toISOString(),
                takenAt: null,
                status: isPast ? 'missed' : 'scheduled'
              });
            }
          }
        }

        current.setDate(current.getDate() + 1);
      }
    }

    const result = Object.keys(calendarData)
      .sort()
      .map(date => ({ date, medications: calendarData[date] }));

    return {
      calendar: result,
      dateRange: { startDate: queryStartDate, endDate: queryEndDate }
    };
  }

  /**
   * Check whether a medication should be scheduled on a given day
   * based on its frequency and start date.
   */
  _shouldScheduleOnDay(currentDate, medStartDate, frequency) {
    switch (frequency) {
      case 'daily':
        return true;
      case 'weekly': {
        // Same weekday as the medication's start date
        return currentDate.getDay() === medStartDate.getDay();
      }
      case 'every other day':
      case 'every_other_day':
      case 'alternate': {
        const msPerDay = 1000 * 60 * 60 * 24;
        const diffDays = Math.floor((currentDate - medStartDate) / msPerDay);
        return diffDays % 2 === 0;
      }
      case 'monthly': {
        return currentDate.getDate() === medStartDate.getDate();
      }
      case 'twice daily':
      case 'twice_daily':
        return true; // timesPerDay handles the number of entries
      default:
        // Unknown frequency — default to daily
        return true;
    }
  }

  /**
   * Spread `timesPerDay` doses evenly across waking hours (08:00–20:00).
   */
  _getScheduledHour(index, timesPerDay) {
    if (timesPerDay <= 1) return 8;
    if (timesPerDay === 2) return index === 0 ? 8 : 20;
    if (timesPerDay === 3) return [8, 14, 20][index] ?? 8;
    if (timesPerDay === 4) return [8, 12, 16, 20][index] ?? 8;
    // Generic fallback for 5+
    const start = 8;
    const span = 12;
    return start + Math.round((index / (timesPerDay - 1)) * span);
  }
}

module.exports = new MedicationService();