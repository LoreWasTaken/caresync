const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Adherence = sequelize.define('Adherence', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: false, // CRITICAL: blocks SQLite alter-sync from leaking standalone UNIQUE from the composite index
      comment: 'UUID link to users table in PII database'
    },
    medicationId: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: false, // CRITICAL: same — only the COMPOSITE index (userId+medicationId+scheduledTime) should be unique
    },
    scheduledTime: {
      type: DataTypes.DATE,
      allowNull: false,
      unique: false, // CRITICAL: same — prevent standalone UNIQUE leak from the composite index
    },
    takenAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    status: {
      type: DataTypes.ENUM('taken', 'missed', 'skipped'),
      allowNull: false,
      defaultValue: 'taken'
    },
    notes: {
      type: DataTypes.TEXT,
      allowNull: true
    }
  }, {
    tableName: 'adherence',
    timestamps: true,
    // ──────────────────────────────────────────────────────────────────
    // CRITICAL HEALTHTECH SAFETY: composite UNIQUE index.
    //
    // Enforces, at the database engine level, that a given user cannot
    // have two adherence rows for the same medication at the same
    // scheduledTime. This is what makes Sequelize.findOrCreate() truly
    // atomic and what defeats the double-click race condition: even if
    // two parallel HTTP handlers race past the SELECT phase, only one
    // INSERT can succeed — the second raises SequelizeUniqueConstraintError
    // which we map back to a deterministic 409 Conflict.
    // ──────────────────────────────────────────────────────────────────
    indexes: [
      {
        unique: true,
        name: 'adherence_user_med_time_uniq',
        fields: ['userId', 'medicationId', 'scheduledTime']
      }
    ]
  });

  return Adherence;
};
