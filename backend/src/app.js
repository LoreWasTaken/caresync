require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const http = require('http');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const medicationRoutes = require('./routes/medications');
const prescriptionRoutes = require('./routes/prescriptions');
const adherenceRoutes = require('./routes/adherence');
const caregiverRoutes = require('./routes/caregivers');
const patientRoutes = require('./routes/patients');
const deviceRoutes = require('./routes/devices');
const notificationRoutes = require('./routes/notifications');

const reportsRoutes = require('./routes/reports');

// Import middleware
const {authMiddleware} = require('./middleware/auth');
const {errorHandler} = require('./middleware/errorHandler');
const logger = require('./utils/logger');

// Import database
const db = require('./config/database');

// Create Express app
const app = express();
const server = http.createServer(app);

// Initialize Socket.IO for real-time notifications
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});

// Make io available globally
app.set('io', io);

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply rate limiting to all requests
app.use(limiter);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "ws:"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: [
    'http://localhost:3000', // React app
    'http://localhost:19006', // Expo Metro
    process.env.CLIENT_URL,
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-device-id', 'x-app-version'],
}));

// Compression middleware
app.use(compression());

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0'
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/users', authMiddleware, userRoutes);
app.use('/api/medications', authMiddleware, medicationRoutes);
app.use('/api/prescriptions', authMiddleware, prescriptionRoutes);
app.use('/api/adherence', authMiddleware, adherenceRoutes);
app.use('/api/caregivers', authMiddleware, caregiverRoutes);
app.use('/api/patients', authMiddleware, patientRoutes);
app.use('/api/devices', authMiddleware, deviceRoutes);
app.use('/api/notifications', authMiddleware, notificationRoutes);
app.use('/api/adherence',authMiddleware, reportsRoutes);

// Socket.IO connection handling
io.on('connection', (socket) => {
  logger.info(`User connected: ${socket.id}`);
  
  // Join user to their personal room
  socket.on('join-user', (userId) => {
    socket.join(`user-${userId}`);
    logger.info(`User ${userId} joined their room`);
  });

  // Handle caregiver joining patient rooms
  socket.on('join-caregiver', (caregiverId) => {
    socket.join(`caregiver-${caregiverId}`);
    logger.info(`Caregiver ${caregiverId} joined caregiver room`);
  });

  socket.on('disconnect', () => {
    logger.info(`User disconnected: ${socket.id}`);
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    path: req.originalUrl
  });
});

// Error handling middleware
app.use(errorHandler);

// Database connection and server start
const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await db.authenticate();
    logger.info('Database connection established successfully.');

    if (process.env.NODE_ENV === 'development') {
      // Disable foreign key constraints temporarily
      await db.query('PRAGMA foreign_keys = OFF;');
      
      await db.sync({ alter: true });
      
      // Re-enable foreign key constraints
      await db.query('PRAGMA foreign_keys = ON;');
      
      logger.info('Database models synchronized.');
    }

    server.listen(PORT, () => {
      logger.info(`🚀 CareSync Backend Server running on port ${PORT}`);
      logger.info(`📱 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`🌐 Health check: http://localhost:${PORT}/health`);
    });

  } catch (error) {
    logger.error('Unable to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  server.close(async () => {
    try {
      await db.close();
      logger.info('Database connection closed.');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  });
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received. Shutting down gracefully...');
  server.close(async () => {
    try {
      await db.close();
      logger.info('Database connection closed.');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Promise Rejection:', err);
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

// Start the server
startServer();

module.exports = app;