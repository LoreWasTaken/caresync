const { DataTypes } = require('sequelize');
const bcrypt = require('bcryptjs');

module.exports = (sequelize) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true
      }
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: false
    },
    role: {
      type: DataTypes.ENUM('patient', 'caregiver', 'healthcare_provider', 'admin'),
      defaultValue: 'patient'
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
      validate: {
        // Add custom validator to skip validation if empty
        isValidPhone(value) {
          if (value && value.length > 0 && (value.length < 10 || value.length > 20)) {
            throw new Error('Phone number must be between 10 and 20 characters');
          }
        }
      }
    },
    dateOfBirth: {
      type: DataTypes.DATEONLY,
      allowNull: true
    },
    profilePicture: {
      type: DataTypes.STRING,
      allowNull: true
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    isEmailVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    emailVerificationToken: {
      type: DataTypes.STRING,
      allowNull: true
    },
    passwordResetToken: {
      type: DataTypes.STRING,
      allowNull: true
    },
    passwordResetExpires: {
      type: DataTypes.DATE,
      allowNull: true
    },
    lastLogin: {
      type: DataTypes.DATE,
      allowNull: true
    },
    preferences: {
      type: DataTypes.JSON,
      defaultValue: {
        language: 'en',
        notifications: {
          email: true,
          push: true,
          sms: false
        },
        accessibility: {
          highContrast: false,
          largeText: false,
          voiceAlerts: true
        }
      }
    },
    emergencyContact: {
      type: DataTypes.JSON,
      defaultValue: {
        name: '',
        phone: '',
        relationship: ''
      }
    }
  }, {
    tableName: 'users',
    timestamps: true,
    hooks: {
      beforeCreate: async (user) => {
        if (user.password) {
          user.password = await bcrypt.hash(user.password, 10);
        }
        // Convert empty strings to null for optional fields
        if (user.phone === '') user.phone = null;
        if (user.dateOfBirth === '') user.dateOfBirth = null;
      },
      beforeUpdate: async (user) => {
        if (user.changed('password')) {
          user.password = await bcrypt.hash(user.password, 10);
        }
        // Convert empty strings to null for optional fields
        if (user.phone === '') user.phone = null;
        if (user.dateOfBirth === '') user.dateOfBirth = null;
      }
    }
  });

  // Instance methods
  User.prototype.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
  };

  User.prototype.toJSON = function() {
    const values = { ...this.get() };
    delete values.password;
    delete values.emailVerificationToken;
    delete values.passwordResetToken;
    delete values.passwordResetExpires;
    return values;
  };

  // Static methods
  User.findByEmail = async function(email) {
    return await this.findOne({ where: { email } });
  };

  return User;
};
