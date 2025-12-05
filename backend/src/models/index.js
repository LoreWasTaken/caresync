const { Sequelize } = require('sequelize');
const sequelize = require('../config/database');

// Import model definitions (these are functions that define models)
const UserModel = require('./User');
const MedicationModel = require('./Medication');
const PrescriptionModel = require('./Prescription');
const AdherenceModel = require('./Adherence');
const DeviceModel = require('./Device');
const NotificationModel = require('./Notification');
const CaregiverPatientModel = require('./CaregiverPatient');

// Initialize models by calling the functions with sequelize
const User = UserModel(sequelize);
const Medication = MedicationModel(sequelize);
const Prescription = PrescriptionModel(sequelize);
const Adherence = AdherenceModel(sequelize);
const Device = DeviceModel(sequelize);
const Notification = NotificationModel(sequelize);
const CaregiverPatient = CaregiverPatientModel(sequelize);

// Define associations
User.hasMany(Medication, { foreignKey: 'userId', as: 'medications' });
Medication.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(Prescription, { foreignKey: 'userId', as: 'prescriptions' });
Prescription.belongsTo(User, { foreignKey: 'userId' });

Medication.hasMany(Prescription, { foreignKey: 'medicationId', as: 'prescriptions' });
Prescription.belongsTo(Medication, { foreignKey: 'medicationId' });

User.hasMany(Adherence, { foreignKey: 'userId', as: 'adherence' });
Adherence.belongsTo(User, { foreignKey: 'userId' });

Medication.hasMany(Adherence, { foreignKey: 'medicationId', as: 'adherence' });
Adherence.belongsTo(Medication, { foreignKey: 'medicationId' });

User.hasMany(Device, { foreignKey: 'userId', as: 'devices' });
Device.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' });
Notification.belongsTo(User, { foreignKey: 'userId' });

CaregiverPatient.belongsTo(User, { 
  foreignKey: 'caregiverId', 
  as: 'caregiver' 
});

CaregiverPatient.belongsTo(User, { 
  foreignKey: 'patientId', 
  as: 'patient' 
});

// Caregiver-Patient relationship (many-to-many through junction table)
User.belongsToMany(User, {
  through: CaregiverPatient,
  as: 'caregivers',
  foreignKey: 'patientId',
  otherKey: 'caregiverId'
});

User.belongsToMany(User, {
  through: CaregiverPatient,
  as: 'patients',
  foreignKey: 'caregiverId',
  otherKey: 'patientId'
});

// Export models and sequelize instance
module.exports = {
  sequelize,
  Sequelize,
  User,
  Medication,
  Prescription,
  Adherence,
  Device,
  Notification,
  CaregiverPatient
};
