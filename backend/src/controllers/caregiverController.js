const { User, CaregiverPatient } = require('../models');
const logger = require('../utils/logger');
const { Op } = require('sequelize');

class CaregiverController {
    /**
   * Get pending invitations for the logged-in caregiver
   * Route: GET /pending
   */
  async getPendingInvitations(req, res) {
    try {
      const relationships = await CaregiverPatient.findAll({
        where: {
          caregiverId: req.user.id,
          isVerified: false,
          isActive: true
        },
        include: [{
          model: User,
          as: 'patient',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone']
        }]
      });

      const invitations = relationships.map(rel => ({
        ...rel.toJSON(),
        patientName: `${rel.patient.firstName} ${rel.patient.lastName}`,
        patientEmail: rel.patient.email
      }));

      res.json({ success: true, data: invitations });
    } catch (error) {
      logger.error('Get pending invitations error:', error);
      throw error;
    }
  }

  /**
   * Accept a caregiver invitation
   * Route: POST /:id/accept
   */
  async acceptInvitation(req, res) {
    try {
      const { id } = req.params;

      const relationship = await CaregiverPatient.findOne({
        where: {
          id,
          caregiverId: req.user.id,
          isVerified: false,
          isActive: true
        }
      });

      if (!relationship) {
        return res.status(404).json({ success: false, message: 'Invitation not found' });
      }

      await relationship.update({ isVerified: true });

      logger.info(`Caregiver ${req.user.email} accepted invitation ${id}`);

      res.json({ success: true, message: 'Invitation accepted successfully', data: relationship });
    } catch (error) {
      logger.error('Accept invitation error:', error);
      throw error;
    }
  }

    async getPatients(req, res) {
    try {
      // REMOVED: const { id } = req.params; 

      const relationships = await CaregiverPatient.findAll({
        where: {
          caregiverId: req.user.id, // Get all entries for this caregiver
          isVerified: true,
          isActive: true
        },
        include: [{
          model: User,
          as: 'patient',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'profilePicture']
        }]
      });

      // Format the response to match what the frontend expects
      const patients = relationships.map(rel => ({
        id: rel.id, // Relationship ID
        patientId: rel.patient.id,
        relationship: rel.relationship,
        status: rel.isVerified ? 'Active' : 'Pending',
        caregiver: { // The frontend component expects a nested object (even if named 'caregiver' in the type, it holds patient info here)
          firstName: rel.patient.firstName,
          lastName: rel.patient.lastName,
          email: rel.patient.email,
          phone: rel.patient.phone
        }
      }));

      res.json({ success: true, data: patients });

    } catch (error) {
      logger.error('Get patients error:', error);
      throw error;
    }
  }

  /**
   * Decline a caregiver invitation
   * Route: POST /:id/decline
   */
  async declineInvitation(req, res) {
    try {
      const { id } = req.params;

      const relationship = await CaregiverPatient.findOne({
        where: {
          id,
          caregiverId: req.user.id,
          isVerified: false,
          isActive: true
        }
      });

      if (!relationship) {
        return res.status(404).json({ success: false, message: 'Invitation not found' });
      }

      await relationship.update({ isActive: false });

      logger.info(`Caregiver ${req.user.email} declined invitation ${id}`);

      res.json({ success: true, message: 'Invitation declined successfully' });
    } catch (error) {
      logger.error('Decline invitation error:', error);
      throw error;
    }
  }
  /**
   * Get all caregivers for the current patient
   */
  async getCaregivers(req, res) {
    try {
      const relationships = await CaregiverPatient.findAll({
        where: { patientId: req.user.id, isActive: true },
        include: [{
          model: User,
          as: 'caregiver',
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'profilePicture']
        }]
      });

      // Flatten structure for frontend
      const caregivers = relationships.map(rel => ({
        ...rel.caregiver.toJSON(),
        relationshipId: rel.id,
        relationshipType: rel.relationship,
        permissions: rel.permissions,
        status: rel.isVerified ? 'Active' : 'Pending'
      }));

      res.json({
        success: true,
        data: { caregivers }
      });
    } catch (error) {
      logger.error('Get caregivers error:', error);
      throw error;
    }
  }

  /**
   * Invite a caregiver by email
   */
  async inviteCaregiver(req, res) {
  try {
    const { email, relationship, permissions } = req.body;

    // Find if user exists
    const caregiverUser = await User.findOne({ where: { email } });

    if (!caregiverUser) {
      return res.status(404).json({ 
        success: false, 
        message: 'User not found. Please ask them to register first.' 
      });
    }

    if (caregiverUser.id === req.user.id) {
      return res.status(400).json({ 
        success: false, 
        message: 'You cannot invite yourself.' 
      });
    }

    // Check if already connected
    const existing = await CaregiverPatient.findOne({
      where: {
        caregiverId: caregiverUser.id,
        patientId: req.user.id,
        isActive: true
      }
    });

    if (existing) {
      return res.status(409).json({ 
        success: false, 
        message: 'Caregiver already connected.' 
      });
    }

    // Create link
    const link = await CaregiverPatient.create({
      caregiverId: caregiverUser.id,
      patientId: req.user.id,
      relationship: relationship || 'other',
      permissions: permissions || { viewMedications: true },
      isVerified: false, // Needs acceptance
      isActive: true
    });

    // **ADD THIS: Create in-app notification**
    const Notification = require('../models').Notification;
    await Notification.create({
      userId: req.user.id,
      caregiverId: caregiverUser.id,
      type: 'caregiveralert',
      title: 'New Caregiver Invitation',
      message: `${req.user.firstName} ${req.user.lastName} has invited you to be their caregiver.`,
      isRead: false,
      priority: 'high'
    });

    // **OPTIONAL: Emit Socket.IO event**
    const io = req.app.get('io');
    if (io) {
      io.to(`user-${caregiverUser.id}`).emit('notification', {
        type: 'caregiver_invitation',
        message: 'You have a new caregiver invitation'
      });
    }

    logger.info(`Caregiver invited: ${email} by ${req.user.email}`);

    res.status(201).json({ success: true, message: 'Invitation sent successfully' });
  } catch (error) {
    logger.error('Invite caregiver error:', error);
    throw error;
  }
}


  /**
   * Remove a caregiver
   */
  async removeCaregiver(req, res) {
    try {
      const { id } = req.params; // Relationship ID or Caregiver ID
      
      // Try to find by relationship ID first
      let link = await CaregiverPatient.findByPk(id);
      
      // If not found, try by caregiver ID for current user
      if (!link) {
        link = await CaregiverPatient.findOne({
          where: { caregiverId: id, patientId: req.user.id }
        });
      }

      if (!link) {
        return res.status(404).json({ success: false, message: 'Relationship not found' });
      }

      await link.update({ isActive: false });
      
      res.json({ success: true, message: 'Caregiver removed successfully' });
    } catch (error) {
      logger.error('Remove caregiver error:', error);
      throw error;
    }
  }
}

module.exports = new CaregiverController();
