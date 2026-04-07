const { DataTypes } = require('sequelize');
const Encrypted = require('sequelize-encrypted');

// Hard upper bound on how far in the future a medication course can run.
// Two years is a clinically reasonable maximum for a single Rx (most acute
// courses are days/weeks; chronic prescriptions get re-issued well within
// this window). This bound exists purely to defeat absurd input that would
// otherwise blow up calendar generation.
const MAX_COURSE_DAYS = 730;

module.exports = (sequelize) => {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY environment variable is required');
  }

  const Medication = sequelize.define('Medication', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'UUID link to users table in PII database'
    },
    name: {
      type: Encrypted(DataTypes.STRING, encryptionKey),
      allowNull: false
    },
    dosage: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      validate: {
        min: { args: [0.01], msg: 'Dosage must be greater than 0' }
      }
    },
    dosageUnit: {
      type: Encrypted(DataTypes.STRING, encryptionKey),
      allowNull: false
    },
    frequency: {
      type: Encrypted(DataTypes.STRING, encryptionKey),
      allowNull: false
    },
    timesPerDay: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      validate: {
        min: { args: [1], msg: 'timesPerDay must be at least 1' },
        max: { args: [24], msg: 'timesPerDay cannot exceed 24' }
      }
    },
    route: {
      type: Encrypted(DataTypes.STRING, encryptionKey),
      allowNull: true
    },
    instructions: {
      type: Encrypted(DataTypes.TEXT, encryptionKey),
      allowNull: true
    },
    startDate: {
      type: DataTypes.DATE,
      allowNull: false
    },
    endDate: {
      // NOTE: nullable at the column level so PRN ("as needed") medications
      // can omit it entirely. The application layer enforces the rule
      //   isPRN === false  =>  endDate IS REQUIRED
      // via routes/medications.js + medicationService.createMedication.
      type: DataTypes.DATE,
      allowNull: true
    },
    // ──────────────────────────────────────────────────────────────────
    // PRN ("Pro Re Nata" / As-Needed / SOS) flag.
    //
    // When true, the medication has no scheduled doses — the patient
    // takes it ad-hoc via "Take Now". The scheduling state machine MUST
    // skip these medications when generating calendar slots, otherwise
    // they would either pollute the calendar (if endDate is missing)
    // or create false "missed" doses (because they were never scheduled
    // in the first place).
    // ──────────────────────────────────────────────────────────────────
    isPRN: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    },
    remainingQuantity: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        // Inventory NEVER goes below zero. The DB rejects it as a last
        // line of defence if any code path forgets the application-layer
        // guard in medicationService.recordAdherence.
        min: { args: [0], msg: 'remainingQuantity cannot be negative' }
      }
    },
    totalQuantity: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        // A "0-pill" prescription is meaningless and breaks the inventory
        // state machine. If the user truly has zero stock, the medication
        // simply shouldn't exist yet.
        min: { args: [1], msg: 'totalQuantity must be at least 1' }
      }
    },
    compartment: {
      type: DataTypes.INTEGER,
      allowNull: true,
      validate: {
        min: 1,
        max: 12
      }
    },
    refillReminder: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    }
  }, {
    tableName: 'medications',
    timestamps: true,
    validate: {
      // Cross-field validation runs AFTER per-field validation. This is
      // where we enforce: (a) endDate >= startDate, (b) endDate is within
      // MAX_COURSE_DAYS of startDate, (c) endDate is mandatory unless PRN.
      endDateConsistency() {
        if (this.isPRN) return; // PRN courses can omit endDate

        if (this.endDate == null) {
          throw new Error('endDate is required for scheduled (non-PRN) medications');
        }

        const start = new Date(this.startDate).getTime();
        const end = new Date(this.endDate).getTime();
        if (Number.isNaN(start) || Number.isNaN(end)) {
          throw new Error('Invalid startDate / endDate');
        }
        if (end < start) {
          throw new Error('endDate must be on or after startDate');
        }
        const maxEnd = start + MAX_COURSE_DAYS * 24 * 60 * 60 * 1000;
        if (end > maxEnd) {
          throw new Error(`endDate cannot be more than ${MAX_COURSE_DAYS} days after startDate`);
        }
      }
    }
  });

  // Expose the cap so the calendar query layer can use the same constant.
  Medication.MAX_COURSE_DAYS = MAX_COURSE_DAYS;

  return Medication;
};
