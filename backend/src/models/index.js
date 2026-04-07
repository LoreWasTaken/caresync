const { Sequelize } = require('sequelize');
const { sequelizePii, sequelizeMedical } = require('../config/database');

// Import model definitions
const UserModel = require('./User');
const CaregiverPatientModel = require('./CaregiverPatient');
const AuditLogModel = require('./AuditLog');
const ConsentLogModel = require('./ConsentLog');
const NotificationModel = require('./Notification');

const MedicationModel = require('./Medication');
const PrescriptionModel = require('./Prescription');
const AdherenceModel = require('./Adherence');
const DeviceModel = require('./Device');
const DeviceAccessPermissionModel = require('./DeviceAccessPermission');
const DeviceInvitationModel = require('./DeviceInvitation');
const DocumentMetadataModel = require('./DocumentMetadata');

// ──────────────────────────────────────────────
// PII Database models (identity + governance)
// ──────────────────────────────────────────────
const User = UserModel(sequelizePii);
const CaregiverPatient = CaregiverPatientModel(sequelizePii);
const AuditLog = AuditLogModel(sequelizePii);
const ConsentLog = ConsentLogModel(sequelizePii);
const Notification = NotificationModel(sequelizePii);

// ──────────────────────────────────────────────
// Medical Database models (clinical data)
// ──────────────────────────────────────────────
const Medication = MedicationModel(sequelizeMedical);
const Prescription = PrescriptionModel(sequelizeMedical);
const Adherence = AdherenceModel(sequelizeMedical);
const Device = DeviceModel(sequelizeMedical);
const DeviceAccessPermission = DeviceAccessPermissionModel(sequelizeMedical);
const DeviceInvitation = DeviceInvitationModel(sequelizeMedical);
const DocumentMetadata = DocumentMetadataModel(sequelizeMedical);

// ──────────────────────────────────────────────
// SAME-DB associations (PII ↔ PII)
// ──────────────────────────────────────────────

// User ↔ Notification
User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' });
Notification.belongsTo(User, { foreignKey: 'userId' });

// User ↔ ConsentLog
ConsentLog.belongsTo(User, { foreignKey: 'userId' });
User.hasMany(ConsentLog, { foreignKey: 'userId', as: 'consentLogs' });

// CaregiverPatient ↔ User
CaregiverPatient.belongsTo(User, { foreignKey: 'caregiverId', as: 'caregiver' });
CaregiverPatient.belongsTo(User, { foreignKey: 'patientId', as: 'patient' });

User.belongsToMany(User, {
  through: CaregiverPatient,
  as: 'caregivers',
  foreignKey: 'patientId',
  otherKey: 'caregiverId',
});

User.belongsToMany(User, {
  through: CaregiverPatient,
  as: 'patients',
  foreignKey: 'caregiverId',
  otherKey: 'patientId',
});

// ──────────────────────────────────────────────
// SAME-DB associations (Medical ↔ Medical)
// ──────────────────────────────────────────────

// Medication ↔ Prescription
Medication.hasMany(Prescription, { foreignKey: { name: 'medicationId', unique: false }, as: 'prescriptions' });
Prescription.belongsTo(Medication, { foreignKey: { name: 'medicationId', unique: false } });

// Medication ↔ Adherence
// CRITICAL FIX: belongsTo() defaults to unique:true on the FK column during
// SQLite sync({ alter: true }), which injects a STANDALONE unique constraint
// on medicationId — separate from the composite unique index defined in
// Adherence.js. This phantom constraint is what causes the 409 "medicationId
// must be unique" error when a user records a second dose for the same med.
// Explicitly setting unique:false tells Sequelize the FK is NOT a 1:1 column.
Medication.hasMany(Adherence, { foreignKey: { name: 'medicationId', unique: false }, as: 'adherence' });
Adherence.belongsTo(Medication, { foreignKey: { name: 'medicationId', unique: false } });

// Device ↔ DeviceAccessPermission
Device.hasMany(DeviceAccessPermission, { foreignKey: 'deviceId', as: 'accessPermissions' });
DeviceAccessPermission.belongsTo(Device, { foreignKey: 'deviceId' });

// Device ↔ DeviceInvitation
Device.hasMany(DeviceInvitation, { foreignKey: 'deviceId', as: 'invitations' });
DeviceInvitation.belongsTo(Device, { foreignKey: 'deviceId' });

// ──────────────────────────────────────────────
// CROSS-DB associations — INTENTIONALLY OMITTED
// The userId fields in medical models are plain UUID strings.
// Joins must be done at the application layer (see utils/crossDbHelper.js).
//
// Removed:
//   User.hasMany(Medication/Prescription/Adherence/Device/...)
//   Medication.belongsTo(User) / Prescription.belongsTo(User) / etc.
//   User.hasMany(DeviceAccessPermission) / User.hasMany(DeviceInvitation)
//   DocumentMetadata.belongsTo(User) / User.hasMany(DocumentMetadata)
// ──────────────────────────────────────────────

module.exports = {
  sequelizePii,
  sequelizeMedical,
  Sequelize,
  User,
  Medication,
  Prescription,
  Adherence,
  Device,
  DeviceAccessPermission,
  DeviceInvitation,
  Notification,
  CaregiverPatient,
  AuditLog,
  DocumentMetadata,
  ConsentLog,
};
