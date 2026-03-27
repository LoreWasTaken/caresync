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
   * Return a YYYY-MM-DD string from a Date using LOCAL time (not UTC).
   * Avoids the timezone-shift bug where .toISOString().split('T')[0]
   * maps midnight-local to the PREVIOUS day in UTC.
   */
  _toLocalDateStr(date) {
    const d = new Date(date);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  /**
   * Determine medication status based on scheduled time and taken time
   */
  _determineMedicationStatus(scheduledTime, takenAt, status) {
    if (status === 'skipped') return 'skipped';
    if (status === 'missed') return 'missed';
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
      whereClause.scheduledTime = { [Op.between]: [new Date(startDate), new Date(endDate)] };
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
      order: [['scheduledTime', 'DESC']]
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

    const resolvedScheduledTime = scheduledTime || new Date().toISOString();
    const resolvedTakenAt = (status === 'taken') ? (takenAt || new Date()) : null;

    // Upsert: if an adherence record already exists for the same medication + scheduledTime,
    // update it instead of creating a duplicate row.
    const [intake, created] = await Adherence.findOrCreate({
      where: {
        userId: user.id,
        medicationId,
        scheduledTime: resolvedScheduledTime,
      },
      defaults: {
        userId: user.id,
        medicationId,
        status: status || 'taken',
        takenAt: resolvedTakenAt,
        scheduledTime: resolvedScheduledTime,
      },
    });

    if (!created) {
      // Record already existed — update it
      const oldStatus = intake.status;
      intake.status = status || 'taken';
      intake.takenAt = resolvedTakenAt;
      await intake.save();

      // If changing FROM taken to missed, restore stock
      if (oldStatus === 'taken' && status !== 'taken') {
        await med.increment('remainingQuantity', { by: 1 });
      }
      // If changing TO taken from non-taken, decrement stock
      if (oldStatus !== 'taken' && status === 'taken') {
        await med.decrement('remainingQuantity', { by: 1 });
      }
    } else {
      // New record — decrement stock only if taken
      if (status === 'taken') {
        await med.decrement('remainingQuantity', { by: 1 });
      }
    }

    return intake;
  }

  async getAdherenceStats(user, query) {
    const { startDate, endDate, period = 'month', patientId } = query;
    const targetUserId = patientId || user.id;

    if (!(await this._validateAccess(user, targetUserId))) {
      throw new AuthorizationError('Access denied to patient data.');
    }

    // Calculate the date range from the period parameter.
    const now = new Date();
    let rangeStart, rangeEnd;

    if (startDate && endDate) {
      rangeStart = new Date(startDate);
      rangeEnd = new Date(endDate);
    } else if (period === 'day') {
      rangeStart = new Date(now); rangeStart.setHours(0, 0, 0, 0);
      rangeEnd = now;
    } else if (period === 'week') {
      rangeStart = new Date(now.getTime() - 7 * 86400000);
      rangeEnd = now;
    } else {
      // 'month' (default) — last 30 days
      rangeStart = new Date(now.getTime() - 30 * 86400000);
      rangeEnd = now;
    }

    // BUG FIX: Filter on scheduledTime instead of takenAt.
    // Missed doses have takenAt=null, so filtering on takenAt excluded them
    // entirely, inflating the adherence rate to 100% when only "taken" rows existed.
    const whereClause = {
      userId: targetUserId,
      scheduledTime: { [Op.between]: [rangeStart, rangeEnd] },
    };

    const adherenceRecords = await Adherence.findAll({
      where: whereClause,
      include: [{ model: Medication, attributes: ['name'] }]
    });

    const total = adherenceRecords.length;
    const taken = adherenceRecords.filter(r => ['taken', 'early', 'late'].includes(r.status)).length;
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
    // Ensure the query end date covers the full day (23:59:59.999) so that
    // medications ending on a specific date include the entire final day.
    const rawEndDate = endDate ? new Date(endDate) : now;
    const queryEndDate = new Date(rawEndDate);
    queryEndDate.setHours(23, 59, 59, 999);

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

    // Index adherence by medicationId + YYYY-MM-DD + hour for slot-level O(1) lookup.
    // Using hour granularity prevents duplication when timesPerDay > 1.
    // CRITICAL: Use LOCAL date/hour (not UTC) so keys match the calendar loop below.
    const adherenceMap = {};
    adherenceRecords.forEach(record => {
      const dt = new Date(record.scheduledTime);
      const date = this._toLocalDateStr(dt);
      const hour = dt.getHours(); // LOCAL hours — matches _getScheduledHour()
      const key = `${record.medicationId}_${date}_${hour}`;
      if (!adherenceMap[key]) adherenceMap[key] = [];
      adherenceMap[key].push(record);
    });

    // 3. Generate schedule entries from medication master data.
    const calendarData = {};
    // Track which adherenceMap keys were consumed by virtual slots
    const consumedKeys = new Set();
    // Index medications by ID for step 4
    const medsById = {};
    medications.forEach(m => { medsById[m.id] = m; });

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
        const dateStr = this._toLocalDateStr(current);

        if (this._shouldScheduleOnDay(current, medStart, frequency)) {
          if (!calendarData[dateStr]) calendarData[dateStr] = [];

          // Generate each slot individually, then check for adherence per slot
          for (let t = 0; t < timesPerDay; t++) {
            const hour = this._getScheduledHour(t, timesPerDay);
            const slotKey = `${med.id}_${dateStr}_${hour}`;
            const slotRecords = adherenceMap[slotKey] || [];

            if (slotRecords.length > 0) {
              consumedKeys.add(slotKey);
              // Real adherence data exists for this specific slot
              slotRecords.forEach(record => {
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
              // No adherence yet for this slot — generate placeholder
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

    // 4. Include orphan adherence records — ad-hoc doses (e.g. "Take Now",
    //    PRN intakes) that don't match any virtual slot. Without this step
    //    they would be invisible to the dashboard cards and chart.
    for (const [key, records] of Object.entries(adherenceMap)) {
      if (consumedKeys.has(key)) continue;

      for (const record of records) {
        const dt = new Date(record.scheduledTime);
        const dateStr = this._toLocalDateStr(dt);
        if (!calendarData[dateStr]) calendarData[dateStr] = [];

        const med = medsById[record.medicationId];
        calendarData[dateStr].push({
          id: record.id,
          medicationId: record.medicationId,
          name: med?.name || 'Unknown Medication',
          dosage: med ? `${med.dosage || ''} ${med.dosageUnit || ''}`.trim() : '',
          compartment: med?.compartment || null,
          scheduledTime: record.scheduledTime,
          takenAt: record.takenAt,
          status: this._determineMedicationStatus(record.scheduledTime, record.takenAt, record.status)
        });
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
      case 'as needed':
      case 'as_needed':
      case 'prn':
        // PRN medications are taken on-demand — they cannot generate
        // scheduled time slots and therefore cannot be "missed".
        return false;
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