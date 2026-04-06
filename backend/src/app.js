require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const { doubleCsrf } = require('csrf-csrf');
const { Server } = require('socket.io');
const http = require('http');

// Import routes
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const medicationRoutes = require('./routes/medications');
const caregiverRoutes = require('./routes/caregivers');
const patientRoutes = require('./routes/patients');
const deviceRoutes = require('./routes/devices');
const notificationRoutes = require('./routes/notifications');
const reportsRoutes = require('./routes/reports');
const consentRoutes = require('./routes/consent');
const twoFactorRoutes = require('./routes/twoFactor');
const prescriptionRoutes = require('./routes/prescriptions');
const apiDocsRoutes = require('./routes/api-docs');

// Import middleware
const { authMiddleware } = require('./middleware/auth');
const { errorHandler } = require('./middleware/errorHandler');
const logger = require('./utils/logger');
const { sequelizePii, sequelizeMedical } = require('./config/database');
const generateSampleData = require('./utils/sampleDataGenerator');

// Swagger setup
const { specs, swaggerUi } = require('./swagger');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});
app.set('io', io);

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // 'unsafe-inline' required for Framer Motion runtime inline styles.
      // TODO: Migrate to nonce-based CSP when Framer Motion supports it.
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "blob:", "https:"],
      // Allow blob: for inline PDF preview (<object>) and prescription upload
      objectSrc: ["'self'", "blob:"],
      frameSrc: ["'self'", "blob:"],
      // PDF.js web worker
      workerSrc: ["'self'", "blob:"],
      // Allow localhost API and WebSockets
      connectSrc: ["'self'", "http://localhost:5000", "https://api.caresync.com", "wss:", "ws:"],
    },
  },
}));


app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:19006',
    process.env.CLIENT_URL,
  ].filter(Boolean),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-device-id', 'x-app-version', 'x-csrf-token'],
}));

// --- HTTPS enforcement for production (behind reverse proxy) ---
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// --- CSRF Protection (Double Submit Cookie via csrf-csrf) ---
const { doubleCsrfProtection, generateCsrfToken } = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET || process.env.SESSION_SECRET,
  getSessionIdentifier: (req) => req.ip || '',
  getTokenFromRequest: (req) => req.headers['x-csrf-token'],
  cookieName: process.env.NODE_ENV === 'production'
    ? '__Host-caresync.x-csrf-token'
    : '_csrf',
  cookieOptions: {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
  },
  size: 64,
  ignoredMethods: ['GET', 'HEAD', 'OPTIONS'],
  errorConfig: {
    statusCode: 403,
    message: 'Invalid or missing CSRF token',
    code: 'ERR_BAD_CSRF_TOKEN',
  },
});

// Endpoint to issue a CSRF token (must be called before any mutating request)
app.get('/api/csrf-token', (req, res) => {
  const token = generateCsrfToken(req, res);
  res.json({ success: true, data: { csrfToken: token } });
});

// Apply CSRF protection globally to all mutating API routes
app.use(doubleCsrfProtection);

// --- Rate Limiting ---
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests, please try again later.' }
});
app.use(globalLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many authentication attempts, please try again later.' }
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);

// Strict rate limiter for 2FA endpoints (brute-force protection for 6-digit codes)
const twoFactorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many 2FA attempts. Please try again later.' }
});
app.use('/api/auth/2fa/verify', twoFactorLimiter);
app.use('/api/auth/2fa/recovery', twoFactorLimiter);

const reportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many report requests, please try again later.' }
});
app.use('/api/reports', reportLimiter);

// DETAILED REQUEST LOGGER
app.use((req, res, next) => {
  const safeBody = { ...req.body };
  if (safeBody.password) safeBody.password = '[REDACTED]';
  if (safeBody.newPassword) safeBody.newPassword = '[REDACTED]';
  if (safeBody.token) safeBody.token = '[REDACTED]';

  logger.info(`Incoming: ${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    query: req.query,
    body: safeBody
  });
  next();
});

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined', { stream: { write: message => logger.info(message.trim()) } }));
}

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Swagger UI route
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

// --- API ROUTES ---
app.use('/api/auth', authRoutes);
app.use('/api/auth/2fa', twoFactorRoutes);
app.use('/api/users', authMiddleware, userRoutes);
app.use('/api/medications', authMiddleware, medicationRoutes);
app.use('/api/caregivers', authMiddleware, caregiverRoutes);
app.use('/api/patients', authMiddleware, patientRoutes);
app.use('/api/devices', authMiddleware, deviceRoutes);
app.use('/api/notifications', authMiddleware, notificationRoutes);
app.use('/api/reports', authMiddleware, reportsRoutes);
app.use('/api/consent', consentRoutes);
app.use('/api/prescriptions', authMiddleware, prescriptionRoutes);
if (process.env.NODE_ENV === 'development') {
  const apiDocsRoutes = require('./routes/api-docs');
  app.use('/api/api-docs', apiDocsRoutes);
}

// Socket.IO
io.on('connection', (socket) => {
  logger.info(`User connected: ${socket.id}`);
  socket.on('join-user', (userId) => socket.join(`user-${userId}`));
  socket.on('join-caregiver', (caregiverId) => socket.join(`caregiver-${caregiverId}`));
  socket.on('disconnect', () => logger.info(`User disconnected: ${socket.id}`));
});

// 404 Handler
app.use('*', (req, res) => {
  logger.warn(`404 Not Found: ${req.method} ${req.originalUrl}`, {
    ip: req.ip,
    userId: req.user?.id || 'anonymous',
    message: 'Frontend requested a non-existent route'
  });
  res.status(404).json({ success: false, message: 'Route not found', path: req.originalUrl });
});

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

async function syncDatabase(instance, label) {
  try {
    await instance.query('PRAGMA foreign_keys = OFF;');
    await instance.sync({ alter: true });
    await instance.query('PRAGMA foreign_keys = ON;');
    logger.info(`${label} database synchronized (ALTER).`);
  } catch (syncError) {
    logger.warn(`${label} safe sync failed. Falling back to FORCE sync...`);
    logger.error(syncError.message);
    await instance.query('PRAGMA foreign_keys = OFF;');
    await instance.sync({ force: true });
    await instance.query('PRAGMA foreign_keys = ON;');
    logger.info(`${label} database synchronized (FORCE).`);
  }
}

async function startServer() {
  try {
    // Authenticate both database connections
    await sequelizePii.authenticate();
    logger.info('PII database connection established successfully.');
    await sequelizeMedical.authenticate();
    logger.info('Medical database connection established successfully.');

    if (process.env.NODE_ENV === 'development') {
      await syncDatabase(sequelizePii, 'PII');
      await syncDatabase(sequelizeMedical, 'Medical');

      // Run sample data generator (handles checking if data exists)
      await generateSampleData();
    } else if (process.env.NODE_ENV === 'test') {
      await sequelizePii.query('PRAGMA foreign_keys = OFF;');
      await sequelizePii.sync({ force: true });
      await sequelizePii.query('PRAGMA foreign_keys = ON;');
      await sequelizeMedical.query('PRAGMA foreign_keys = OFF;');
      await sequelizeMedical.sync({ force: true });
      await sequelizeMedical.query('PRAGMA foreign_keys = ON;');
      logger.info('Both databases synchronized (FORCE) for test environment.');
    }

    server.listen(PORT, () => {
      logger.info(`🚀 CareSync Backend Server running on port ${PORT}`);
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
      await sequelizePii.close();
      await sequelizeMedical.close();
      logger.info('Both database connections closed.');
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
      await sequelizePii.close();
      await sequelizeMedical.close();
      logger.info('Both database connections closed.');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  });
});

process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Promise Rejection:', err);
  process.exit(1);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
  process.exit(1);
});

startServer();

module.exports = app;
