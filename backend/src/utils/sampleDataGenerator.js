const { User, Medication, Adherence } = require('../models');
const logger = require('./logger');

async function generateSampleData() {
  try {
    // Check if the main sample user already exists
    const existingUser = await User.findOne({ where: { email: 'john@doe.com' } });
    if (existingUser) {
      logger.info('Sample data already exists. Skipping generation.');
      return;
    }

    logger.info('Generating sample data...');

    // 1. Create Users
    const patient = await User.create({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@doe.com',
      password: 'test123', // Will be hashed by model hook
      role: 'patient',
      phone: '1234567890',
      dateOfBirth: '1980-01-01',
      isActive: true,
      isEmailVerified: true
    });

    const caregiver = await User.create({
      firstName: 'Jane',
      lastName: 'Care',
      email: 'janecare@giver.com',
      password: 'whois123',
      role: 'caregiver',
      phone: '0987654321',
      isActive: true,
      isEmailVerified: true
    });

    logger.info(`Created users: ${patient.email}, ${caregiver.email}`);

    // 2. Create Medications for Patient
    // Medication A: Daily (Morning)
    const medA = await Medication.create({
      userId: patient.id,
      name: 'Lisinopril',
      dosage: '10',
      dosageUnit: 'mg',
      totalQuantity: 30,
      remainingQuantity: 28,
      frequency: 'daily',
      timesPerDay: 1,
      startDate: new Date(),
      endDate: new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000),
      isPRN: false,
      isActive: true,
      instructions: 'Take with breakfast'
    });

    // Medication B: Twice daily (Morning/Evening)
    const medB = await Medication.create({
      userId: patient.id,
      name: 'Metformin',
      dosage: '500',
      dosageUnit: 'mg',
      totalQuantity: 60,
      remainingQuantity: 55,
      frequency: 'daily',
      timesPerDay: 2,
      startDate: new Date(),
      endDate: new Date(new Date().getTime() + 30 * 24 * 60 * 60 * 1000),
      isPRN: false,
      isActive: true,
      instructions: 'Take with meals'
    });

    logger.info('Created sample medications');

    // 3. Create Adherence History (Last 3 days)
    const adherenceRecords = [];
    const now = new Date();
    
    // Generate records for the last 3 days
    for (let i = 1; i <= 3; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      
      // Med A: Taken every morning at 8:00 AM
      const scheduledTimeA = new Date(date);
      scheduledTimeA.setHours(8, 0, 0, 0);
      
      const takenTimeA = new Date(scheduledTimeA);
      takenTimeA.setMinutes(Math.floor(Math.random() * 20)); // Randomly 0-20 mins late

      adherenceRecords.push({
        userId: patient.id,
        medicationId: medA.id,
        status: 'taken',
        scheduledTime: scheduledTimeA,
        takenAt: takenTimeA
      });

      // Med B: Taken morning (8:00) and missed evening (20:00) sometimes
      // Morning dose
      const scheduledTimeB1 = new Date(date);
      scheduledTimeB1.setHours(8, 0, 0, 0);
      
      adherenceRecords.push({
        userId: patient.id,
        medicationId: medB.id,
        status: 'taken',
        scheduledTime: scheduledTimeB1,
        takenAt: new Date(scheduledTimeB1.getTime() + 5 * 60000) // 5 mins late
      });

      // Evening dose
      const scheduledTimeB2 = new Date(date);
      scheduledTimeB2.setHours(20, 0, 0, 0);

      // Randomly miss one evening dose
      if (Math.random() > 0.3) {
        adherenceRecords.push({
          userId: patient.id,
          medicationId: medB.id,
          status: 'taken',
          scheduledTime: scheduledTimeB2,
          takenAt: new Date(scheduledTimeB2.getTime() + 10 * 60000)
        });
      } else {
        adherenceRecords.push({
          userId: patient.id,
          medicationId: medB.id,
          status: 'missed',
          scheduledTime: scheduledTimeB2,
          takenAt: null // Explicitly missed
        });
      }
    }

    await Adherence.bulkCreate(adherenceRecords);
    logger.info(`Created ${adherenceRecords.length} adherence records`);
    
    logger.info('✅ Sample data generation complete');

  } catch (error) {
    logger.error('Failed to generate sample data:', error);
  }
}

module.exports = generateSampleData;
