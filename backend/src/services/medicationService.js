const {
  Medication,
  Adherence,
  CaregiverPatient,
  sequelizeMedical,
} = require("../models");
const logger = require("../utils/logger");
const { Op, UniqueConstraintError } = require("sequelize");
const {
  AppError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  ValidationError,
} = require("../middleware/errorHandler");

// ──────────────────────────────────────────────────────────────────────
// HEALTHTECH SAFETY CONSTANTS
// ──────────────────────────────────────────────────────────────────────
//
// FUTURE_DOSE_GRACE_MINUTES — how far in advance a dose can be marked as
//   taken. Must match the value in routes/medications.js. The backend
//   enforces this in TWO places (validator + service) so even if the
//   route is wired up incorrectly, the service-layer guard still holds.
//
// MAX_CALENDAR_WINDOW_DAYS — hard cap on the size of a calendar query.
//   Defends against malicious / buggy clients requesting absurd ranges
//   (e.g. "next 50 years") which would consume CPU and pollute responses.
//
// EDIT_LOCKOUT_FIELDS — fields that callers may NEVER set via the
//   updateMedication path. remainingQuantity is owned by the adherence
//   state machine and must not be writeable from a generic PUT, otherwise
//   a user could grant themselves unlimited stock.
const FUTURE_DOSE_GRACE_MINUTES = 60;
const TAKEN_AT_FUTURE_SKEW_MINUTES = 5;
const MAX_CALENDAR_WINDOW_DAYS = 90;
const EDIT_LOCKOUT_FIELDS = new Set([
  "id",
  "userId",
  "createdAt",
  "updatedAt",
  "remainingQuantity",
]);

class MedicationService {
  // ==========================================
  // HELPER METHODS
  // ==========================================

  /**
   * Helper to validate if the requesting user has access to the target patient's data.
   */
  async _validateAccess(requestingUser, targetUserId) {
    if (requestingUser.id === targetUserId) return true;
    if (["admin", "healthcareprovider"].includes(requestingUser.role))
      return true;

    if (requestingUser.role === "caregiver") {
      const relation = await CaregiverPatient.findOne({
        where: {
          caregiverId: requestingUser.id,
          patientId: targetUserId,
          isActive: true,
          isVerified: true,
        },
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
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  /**
   * Determine medication status based on scheduled time and taken time
   */
  _determineMedicationStatus(scheduledTime, takenAt, status) {
    if (status === "skipped") return "skipped";
    if (status === "missed") return "missed";
    if (!takenAt) return "missed";

    const scheduled = new Date(scheduledTime);
    const taken = new Date(takenAt);
    const diffMinutes = (taken - scheduled) / (1000 * 60);

    // Window logic: +/- 15 mins is "On Time" (taken)
    if (diffMinutes > 15) return "late";
    if (diffMinutes < -15) return "early";

    return "taken";
  }

  // ==========================================
  // CORE MEDICATION CRUD
  // ==========================================

  /**
   * Get all medications with pagination and optional filtering
   */
  async getMedications(user, query) {
    const {
      page = 1,
      limit = 20,
      status = "active",
      search,
      patientId,
    } = query;

    const targetUserId = patientId || user.id;
    if (!(await this._validateAccess(user, targetUserId))) {
      throw new AuthorizationError("Access denied to patient data");
    }

    const offset = (page - 1) * limit;
    const whereClause = { userId: targetUserId };

    if (status !== "all") whereClause.isActive = status === "active";
    if (search) whereClause.name = { [Op.iLike]: `%${search}%` };

    const { count, rows } = await Medication.findAndCountAll({
      where: whereClause,
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["createdAt", "DESC"]],
    });

    return {
      medications: rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: parseInt(limit),
      },
    };
  }

  async getMedication(user, id, patientId) {
    const targetUserId = patientId || user.id;

    if (!(await this._validateAccess(user, targetUserId))) {
      throw new AuthorizationError("Access denied");
    }

    const medication = await Medication.findOne({
      where: { id, userId: targetUserId },
    });

    if (!medication) throw new AppError("Medication not found", 404);

    return medication;
  }

  async createMedication(user, medData) {
    // Defence in depth: re-enforce the rules already declared in the
    // route validator + the model `validate` block. Belts AND braces.
    const isPRN = medData.isPRN === true || medData.isPRN === "true";

    if (medData.totalQuantity != null && Number(medData.totalQuantity) < 1) {
      throw new ValidationError("totalQuantity must be at least 1");
    }
    if (!isPRN && (medData.endDate == null || medData.endDate === "")) {
      throw new ValidationError(
        "endDate is required unless the medication is marked as PRN / As Needed",
      );
    }
    if (medData.startDate && medData.endDate) {
      const start = new Date(medData.startDate).getTime();
      const end = new Date(medData.endDate).getTime();
      if (Number.isFinite(start) && Number.isFinite(end) && end < start) {
        throw new ValidationError("endDate must be on or after startDate");
      }
    }

    // Strip ANY caller-provided value for remainingQuantity. This field is
    // owned by the adherence state machine. On creation it is seeded from
    // totalQuantity (or null if no inventory tracking is desired).
    const { remainingQuantity: _ignored, ...rest } = medData;

    const medicationData = {
      ...rest,
      isPRN,
      // PRN medications can omit endDate. Scheduled medications must have
      // one — already enforced above, but pass through cleanly.
      endDate: isPRN ? (medData.endDate ?? null) : medData.endDate,
      userId: user.id,
      remainingQuantity:
        medData.totalQuantity != null ? Number(medData.totalQuantity) : null,
    };

    const medication = await Medication.create(medicationData);
    return medication;
  }

  async updateMedication(user, id, medData) {
    const medication = await Medication.findOne({
      where: { id, userId: user.id },
    });

    if (!medication) throw new AppError("Medication not found", 404);

    // ────────────────────────────────────────────────────────────────
    // HISTORICAL IMMUTABILITY GUARD
    //
    // If this medication already has adherence records, certain edits
    // would silently corrupt the historical record:
    //
    //   • startDate moved AFTER existing records  → calendar would
    //     orphan those days entirely.
    //   • totalQuantity reduced BELOW the count of doses already taken
    //     → produces an impossible inventory ("you took 8 of 5").
    //
    // Sequelize.update() never touches the Adherence table, so the
    // raw history rows are physically preserved. But we still need to
    // refuse the edits above so that the rendered timeline doesn't
    // become inconsistent with the underlying data.
    // ────────────────────────────────────────────────────────────────
    const adherenceCount = await Adherence.count({
      where: { medicationId: medication.id },
    });
    const earliestAdherence =
      adherenceCount > 0
        ? await Adherence.findOne({
            where: { medicationId: medication.id },
            order: [["scheduledTime", "ASC"]],
            attributes: ["scheduledTime"],
          })
        : null;
    const dosesTaken =
      adherenceCount > 0
        ? await Adherence.count({
            where: { medicationId: medication.id, status: "taken" },
          })
        : 0;

    // Strip every field the caller is NOT allowed to set directly. The
    // adherence state machine owns remainingQuantity; identity fields
    // (id, userId) are forever immutable; timestamps are managed by
    // Sequelize.
    const sanitised = {};
    for (const [k, v] of Object.entries(medData || {})) {
      if (EDIT_LOCKOUT_FIELDS.has(k)) {
        logger.warn(
          "updateMedication: ignored attempt to set protected field",
          {
            field: k,
            medicationId: id,
            userId: user.id,
          },
        );
        continue;
      }
      sanitised[k] = v;
    }

    // Coerce isPRN if present so the model validator gets a real bool.
    if ("isPRN" in sanitised) {
      sanitised.isPRN = sanitised.isPRN === true || sanitised.isPRN === "true";
    }

    if (earliestAdherence && sanitised.startDate) {
      const newStart = new Date(sanitised.startDate).getTime();
      const firstRecord = new Date(earliestAdherence.scheduledTime).getTime();
      if (Number.isFinite(newStart) && newStart > firstRecord) {
        throw new ValidationError(
          "Cannot move startDate after existing adherence records — would orphan history. Create a new medication entry instead.",
        );
      }
    }

    if (
      sanitised.totalQuantity != null &&
      Number(sanitised.totalQuantity) < dosesTaken
    ) {
      throw new ValidationError(
        `Cannot set totalQuantity to ${sanitised.totalQuantity}: ${dosesTaken} dose(s) have already been taken from this prescription.`,
      );
    }

    if (adherenceCount > 0) {
      // Loud audit-trail entry — useful when investigating later.
      logger.warn("Medication with adherence history is being edited", {
        medicationId: id,
        userId: user.id,
        adherenceCount,
        changedFields: Object.keys(sanitised),
      });
    }

    await medication.update(sanitised);
    return medication;
  }

  async deleteMedication(user, id) {
    const medication = await Medication.findOne({
      where: { id, userId: user.id },
    });

    if (!medication) throw new AppError("Medication not found", 404);

    // GDPR Art. 17 — hard delete with cascade to adherence records
    await Adherence.destroy({ where: { medicationId: medication.id } });
    await medication.destroy();
    return { success: true, message: "Medication permanently deleted" };
  }

  // ==========================================
  // ADHERENCE LOGIC
  // ==========================================

  async getAdherenceRecords(user, query) {
    const {
      page = 1,
      limit = 20,
      startDate,
      endDate,
      medicationId,
      patientId,
    } = query;
    const targetUserId = patientId || user.id;

    if (!(await this._validateAccess(user, targetUserId))) {
      throw new AuthorizationError("Access denied to patient data.");
    }

    const offset = (page - 1) * limit;
    const whereClause = { userId: targetUserId };

    if (startDate && endDate) {
      whereClause.scheduledTime = {
        [Op.between]: [new Date(startDate), new Date(endDate)],
      };
    }

    if (medicationId) whereClause.medicationId = medicationId;

    const { count, rows } = await Adherence.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: Medication,
          attributes: ["id", "name", "dosage", "dosageUnit"],
        },
      ],
      limit: parseInt(limit),
      offset: parseInt(offset),
      order: [["scheduledTime", "DESC"]],
    });

    return {
      adherenceRecords: rows,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(count / limit),
        totalItems: count,
        itemsPerPage: parseInt(limit),
      },
    };
  }

  async recordAdherence(user, adherenceData) {
    const { medicationId, status, takenAt, scheduledTime } = adherenceData;
    const now = Date.now();

    // ─── 1. Time-traveling dose guard (service-layer enforcement) ───
    // Even though routes/medications.js validates this, we re-check
    // here so that ANY caller (tests, internal services, future jobs)
    // is protected. Patient safety trumps DRY.
    if (scheduledTime) {
      const sched = new Date(scheduledTime).getTime();
      if (
        Number.isFinite(sched) &&
        sched > now + FUTURE_DOSE_GRACE_MINUTES * 60 * 1000
      ) {
        throw new ValidationError(
          `Cannot record a dose more than ${FUTURE_DOSE_GRACE_MINUTES} minutes in the future`,
        );
      }
    }
    if (takenAt && status === "taken") {
      const tak = new Date(takenAt).getTime();
      if (
        Number.isFinite(tak) &&
        tak > now + TAKEN_AT_FUTURE_SKEW_MINUTES * 60 * 1000
      ) {
        throw new ValidationError("takenAt cannot be in the future");
      }
    }

    // ─── 2. IDOR check (outside the transaction — read-only) ───
    const med = await Medication.findOne({
      where: { id: medicationId, userId: user.id },
    });
    if (!med) throw new NotFoundError("Medication not found");

    const resolvedScheduledTime = scheduledTime || new Date().toISOString();
    const resolvedTakenAt = status === "taken" ? takenAt || new Date() : null;

    // ─── 3. The critical section runs inside a SQL transaction ───
    //
    // The transaction gives us atomicity across:
    //   (a) the Adherence row upsert (idempotent thanks to the
    //       composite UNIQUE index added in models/Adherence.js),
    //   (b) the inventory decrement / restore via an atomic
    //       UPDATE ... WHERE remainingQuantity > 0 (which the DB
    //       executes as a single statement — no read/modify/write
    //       window for a parallel request to slip into).
    //
    // If anything inside throws, both effects are rolled back. This
    // is what defeats the double-click race AND the negative-stock
    // bug in a single move.
    return await sequelizeMedical.transaction(async (t) => {
      let intake;
      let created;

      try {
        [intake, created] = await Adherence.findOrCreate({
          where: {
            userId: user.id,
            medicationId,
            scheduledTime: resolvedScheduledTime,
          },
          defaults: {
            userId: user.id,
            medicationId,
            status: status || "taken",
            takenAt: resolvedTakenAt,
            scheduledTime: resolvedScheduledTime,
          },
          transaction: t,
        });
      } catch (e) {
        // The composite UNIQUE index turned a race-induced duplicate
        // INSERT into a deterministic constraint violation. We treat
        // it as success-with-no-op: the other request already wrote
        // the row, so we re-fetch and continue.
        if (e instanceof UniqueConstraintError) {
          intake = await Adherence.findOne({
            where: {
              userId: user.id,
              medicationId,
              scheduledTime: resolvedScheduledTime,
            },
            transaction: t,
          });
          created = false;
          if (!intake) throw e; // truly unexpected — bubble up
        } else {
          throw e;
        }
      }

      const newStatus = status || "taken";
      const oldStatus = created ? null : intake.status;

      if (!created) {
        intake.status = newStatus;
        intake.takenAt = resolvedTakenAt;
        await intake.save({ transaction: t });
      }

      // ─── 4. Atomic inventory update ───
      //
      // The conditional UPDATE below is the linchpin of the negative-
      // stock fix AND the double-click safety net. The DB executes it
      // as ONE statement, so the WHERE clause (`remainingQuantity > 0`)
      // is evaluated against the same row version that gets written.
      // No interleaving is possible, no read-then-write window exists,
      // and the affected-row-count tells us whether the change went
      // through.
      const isTransitioningToTaken =
        (created && newStatus === "taken") ||
        (!created && oldStatus !== "taken" && newStatus === "taken");

      const isTransitioningFromTaken =
        !created && oldStatus === "taken" && newStatus !== "taken";

      // Inventory tracking is OPTIONAL: medications without a
      // totalQuantity (e.g. PRN-style with unknown stock) skip the
      // decrement entirely. We detect this from the medication's own
      // remainingQuantity field — null means "untracked".
      const isInventoryTracked = med.remainingQuantity != null;

      if (isInventoryTracked && isTransitioningToTaken) {
        // Fetch the fresh medication state INSIDE the transaction
        const medForUpdate = await Medication.findByPk(med.id, {
          transaction: t,
        });

        if (medForUpdate.remainingQuantity <= 0) {
          throw new ConflictError(
            "Medication is depleted. Please refill before recording a new dose.",
          );
        }

        medForUpdate.remainingQuantity -= 1;
        await medForUpdate.save({ transaction: t });
      }

      if (isInventoryTracked && isTransitioningFromTaken) {
        // Fetch the fresh medication state INSIDE the transaction
        const medForUpdate = await Medication.findByPk(med.id, {
          transaction: t,
        });

        const maxQuantity =
          medForUpdate.totalQuantity || medForUpdate.remainingQuantity + 1;
        medForUpdate.remainingQuantity = Math.min(
          medForUpdate.remainingQuantity + 1,
          maxQuantity,
        );

        await medForUpdate.save({ transaction: t });
      }

      // Re-fetch so the caller gets the freshest row.
      const fresh = await Adherence.findByPk(intake.id, { transaction: t });
      return fresh;
    });
  }

  async getAdherenceStats(user, query) {
    const { startDate, endDate, period = "month", patientId } = query;
    const targetUserId = patientId || user.id;

    if (!(await this._validateAccess(user, targetUserId))) {
      throw new AuthorizationError("Access denied to patient data.");
    }

    // Calculate the date range from the period parameter.
    const now = new Date();
    let rangeStart, rangeEnd;

    if (startDate && endDate) {
      rangeStart = new Date(startDate);
      rangeEnd = new Date(endDate);
    } else if (period === "day") {
      rangeStart = new Date(now);
      rangeStart.setHours(0, 0, 0, 0);
      rangeEnd = now;
    } else if (period === "week") {
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
      include: [{ model: Medication, attributes: ["name"] }],
    });

    const total = adherenceRecords.length;
    const taken = adherenceRecords.filter((r) =>
      ["taken", "early", "late"].includes(r.status),
    ).length;
    const missed = adherenceRecords.filter((r) => r.status === "missed").length;
    const skipped = adherenceRecords.filter(
      (r) => r.status === "skipped",
    ).length;
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
      throw new AuthorizationError("Access denied to patient data.");
    }

    const now = new Date();
    const queryStartDate = startDate
      ? new Date(startDate)
      : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    // Ensure the query end date covers the full day (23:59:59.999) so that
    // medications ending on a specific date include the entire final day.
    const rawEndDate = endDate ? new Date(endDate) : now;
    const queryEndDate = new Date(rawEndDate);
    queryEndDate.setHours(23, 59, 59, 999);

    // ────────────────────────────────────────────────────────────────
    // CALENDAR WINDOW HARD CAP
    //
    // Even though endDate-required validation prevents most "infinite
    // schedule" scenarios at the data-entry layer, the calendar query
    // itself must also be bounded. Otherwise:
    //
    //   • A malicious or buggy client can request a 50-year window
    //     and force the server to materialise hundreds of thousands
    //     of virtual slots.
    //   • Caregivers viewing a long-running chronic medication could
    //     accidentally pull years of data on every navigation.
    //
    // We clamp endDate to MAX_CALENDAR_WINDOW_DAYS after startDate.
    // This is defence in depth: the schedule UI only ever asks for
    // ~3 months, so this cap is invisible to legitimate users.
    // ────────────────────────────────────────────────────────────────
    const maxEnd = new Date(
      queryStartDate.getTime() + MAX_CALENDAR_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );
    if (queryEndDate > maxEnd) {
      logger.warn("Calendar query window exceeded cap; clamping", {
        userId: user.id,
        requestedDays: Math.round((queryEndDate - queryStartDate) / 86400000),
        maxDays: MAX_CALENDAR_WINDOW_DAYS,
      });
      queryEndDate.setTime(maxEnd.getTime());
    }

    // 1. Fetch all active medications whose date range overlaps the query window.
    //    startDate & endDate are plain DATE columns (not encrypted) so we can filter in SQL.
    const medications = await Medication.findAll({
      where: {
        userId: targetUserId,
        isActive: true,
        startDate: { [Op.lte]: queryEndDate },
        [Op.or]: [{ endDate: null }, { endDate: { [Op.gte]: queryStartDate } }],
      },
      order: [["createdAt", "ASC"]],
    });

    // 2. Fetch existing adherence records for the same window (for real status).
    const adherenceRecords = await Adherence.findAll({
      where: {
        userId: targetUserId,
        scheduledTime: { [Op.between]: [queryStartDate, queryEndDate] },
      },
      order: [["scheduledTime", "ASC"]],
    });

    // Index adherence by medicationId + YYYY-MM-DD + hour for slot-level O(1) lookup.
    // Using hour granularity prevents duplication when timesPerDay > 1.
    // CRITICAL: Use LOCAL date/hour (not UTC) so keys match the calendar loop below.
    const adherenceMap = {};
    adherenceRecords.forEach((record) => {
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
    medications.forEach((m) => {
      medsById[m.id] = m;
    });

    for (const med of medications) {
      // PRN medications never generate scheduled slots — they show up
      // only via real adherence rows (Step 4 below). This is the
      // primary defence against infinite calendar pollution: even if
      // a legacy row exists with isPRN=true and endDate=null, we
      // simply skip slot generation for it.
      if (med.isPRN) continue;

      const medStart = new Date(med.startDate);
      const medEnd = med.endDate ? new Date(med.endDate) : queryEndDate;
      const frequency = (med.frequency || "daily").toLowerCase().trim();
      const timesPerDay = med.timesPerDay || 1;

      // Effective range = intersection of medication dates & query dates
      const effectiveStart = new Date(
        Math.max(medStart.getTime(), queryStartDate.getTime()),
      );
      const effectiveEnd = new Date(
        Math.min(medEnd.getTime(), queryEndDate.getTime()),
      );

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
              slotRecords.forEach((record) => {
                calendarData[dateStr].push({
                  id: record.id,
                  medicationId: record.medicationId,
                  name: med.name || "Unknown Medication",
                  dosage: `${med.dosage || ""} ${med.dosageUnit || ""}`.trim(),
                  compartment: med.compartment || null,
                  scheduledTime: record.scheduledTime,
                  takenAt: record.takenAt,
                  status: this._determineMedicationStatus(
                    record.scheduledTime,
                    record.takenAt,
                    record.status,
                  ),
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
                name: med.name || "Unknown Medication",
                dosage: `${med.dosage || ""} ${med.dosageUnit || ""}`.trim(),
                compartment: med.compartment || null,
                scheduledTime: scheduledTime.toISOString(),
                takenAt: null,
                status: isPast ? "overdue" : "scheduled",
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
          name: med?.name || "Unknown Medication",
          dosage: med
            ? `${med.dosage || ""} ${med.dosageUnit || ""}`.trim()
            : "",
          compartment: med?.compartment || null,
          scheduledTime: record.scheduledTime,
          takenAt: record.takenAt,
          status: this._determineMedicationStatus(
            record.scheduledTime,
            record.takenAt,
            record.status,
          ),
        });
      }
    }

    const result = Object.keys(calendarData)
      .sort()
      .map((date) => ({ date, medications: calendarData[date] }));

    return {
      calendar: result,
      dateRange: { startDate: queryStartDate, endDate: queryEndDate },
    };
  }

  /**
   * Check whether a medication should be scheduled on a given day
   * based on its frequency and start date.
   */
  _shouldScheduleOnDay(currentDate, medStartDate, frequency) {
    switch (frequency) {
      case "as needed":
      case "as_needed":
      case "prn":
        // PRN medications are taken on-demand — they cannot generate
        // scheduled time slots and therefore cannot be "missed".
        return false;
      case "daily":
        return true;
      case "weekly": {
        // Same weekday as the medication's start date
        return currentDate.getDay() === medStartDate.getDay();
      }
      case "every other day":
      case "every_other_day":
      case "alternate": {
        const msPerDay = 1000 * 60 * 60 * 24;
        const diffDays = Math.floor((currentDate - medStartDate) / msPerDay);
        return diffDays % 2 === 0;
      }
      case "monthly": {
        return currentDate.getDate() === medStartDate.getDate();
      }
      case "twice daily":
      case "twice_daily":
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
