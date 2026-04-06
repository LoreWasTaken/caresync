const medicationService = require('../services/medicationService');
const pemParserService = require('../services/pemParserService');
const prescriptionParser = require('../services/prescriptionParser');

const logger = require('../utils/logger');
const ApiResponse = require('../utils/ApiResponse');

class MedicationController {

  // ==========================================
  // CORE MEDICATION CRUD
  // ==========================================

  /**
   * Get all medications with pagination and optional filtering
   */
  async getMedications(req, res) {
    try {
      const query = req.query;
      const result = await medicationService.getMedications(req.user, query);

      const response = ApiResponse.success(
        result.medications,
        null,
        200
      );
      response.pagination = result.pagination;

      res.json(response);
    } catch (error) {
      logger.error('Get medications error', error);
      throw error;
    }
  }

  async getMedication(req, res) {
    try {
      const { id } = req.params;
      const { patientId } = req.query;
      const medication = await medicationService.getMedication(req.user, id, patientId);

      const response = ApiResponse.success(medication);

      res.json(response);
    } catch (error) {
      logger.error('Get medication error', error);
      throw error;
    }
  }

  async createMedication(req, res) {
    try {
      const medData = req.body;
      const medication = await medicationService.createMedication(req.user, medData);

      const response = ApiResponse.success(
        medication,
        'Medication created successfully',
        201
      );

      res.status(201).json(response);
    } catch (error) {
      logger.error('Create medication error', error);
      throw error;
    }
  }

  async updateMedication(req, res) {
    try {
      const { id } = req.params;
      const medData = req.body;
      const medication = await medicationService.updateMedication(req.user, id, medData);

      const response = ApiResponse.success(
        medication,
        'Medication updated successfully'
      );

      res.json(response);
    } catch (error) {
      logger.error('Update medication error', error);
      throw error;
    }
  }

  async deleteMedication(req, res) {
    try {
      const { id } = req.params;
      const result = await medicationService.deleteMedication(req.user, id);

      const response = ApiResponse.success(
        null,
        result.message
      );

      res.json(response);
    } catch (error) {
      logger.error('Delete medication error', error);
      throw error;
    }
  }

  async processPemScan(req, res) {
    try {
      const { qrData } = req.body;
      
      if (!qrData) {
        throw new Error('QR Data is required');
      }

      // 1. Parse the string
      const parsedKeys = pemParserService.parse(qrData);

      // 2. "Fetch" (simulate) data from SNS using the keys
      const medicationData = await pemParserService.fetchMedicationDetails(
        parsedKeys.prescriptionId, 
        parsedKeys.accessCode
      );

      // 3. Create the medication record for the user
      // Note: We use the existing create service logic
      const medication = await medicationService.createMedication(req.user, {
        name: medicationData.name,
        dosage: medicationData.dosage,
        dosageUnit: medicationData.dosageUnit,
        frequency: medicationData.frequency,
        instructions: medicationData.instructions,
        startDate: new Date(),
        totalQuantity: 20, // Default for PEM
        timesPerDay: 2,
        notes: `Imported via SNS PEM Scan (Rx: ${parsedKeys.prescriptionId})`
      });

      const response = ApiResponse.success(
        medication,
        'PEM Prescription imported successfully'
      );

      res.status(201).json(response);
    } catch (error) {
      logger.error('PEM Scan error:', error);
      throw error;
    }
  }

  // ==========================================
  // PRESCRIPTION PARSER
  // ==========================================

  async parsePrescription(req, res) {
    try {
      if (!req.file) {
        throw new Error('No prescription file uploaded');
      }

      // Explicit engine selection: 'regex' (default) or 'ai'
      const engine = req.body.engine === 'ai' ? 'ai' : 'regex';
      logger.info('Prescription parse requested with engine: %s', engine);
      const result = await prescriptionParser.parsePrescription(req.file.buffer, engine);

      const response = ApiResponse.success(
        result,
        result.success
          ? `Parsed ${result.medications.length} medication(s) via ${result.mode}`
          : 'No medications could be extracted from this document'
      );

      res.json(response);
    } catch (error) {
      logger.error('Prescription parse error:', error);
      throw error;
    }
  }

  // ==========================================
  // ADHERENCE LOGIC
  // ==========================================

  async getAdherenceRecords(req, res) {
    try {
      const query = req.query;
      const result = await medicationService.getAdherenceRecords(req.user, query);

      const response = ApiResponse.success(
        result.adherenceRecords,
        null,
        200
      );
      response.pagination = result.pagination;

      res.json(response);
    } catch (error) {
      logger.error('Get adherence records error', error);
      throw error;
    }
  }

  async recordAdherence(req, res) {
    try {
      const adherenceData = req.body;
      const intake = await medicationService.recordAdherence(req.user, adherenceData);

      const response = ApiResponse.success(
        intake,
        'Adherence recorded successfully',
        201
      );

      res.status(201).json(response);
    } catch (error) {
      logger.error('Record adherence error', error);
      throw error;
    }
  }

  async getAdherenceStats(req, res) {
    try {
      const query = req.query;
      const stats = await medicationService.getAdherenceStats(req.user, query);

      const response = ApiResponse.success(stats);

      res.json(response);
    } catch (error) {
      logger.error('Get adherence stats error', error);
      throw error;
    }
  }

  // ==========================================
  // CALENDAR / SCHEDULE LOGIC
  // ==========================================

  async getCalendarData(req, res) {
    try {
      const query = req.query;
      const result = await medicationService.getCalendarData(req.user, query);

      const response = ApiResponse.success(result);

      res.json(response);

    } catch (error) {
      logger.error('Get calendar data error', error);
      throw error;
    }
  }
}

module.exports = new MedicationController();
