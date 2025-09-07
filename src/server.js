import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import compression from 'compression'
import morgan from 'morgan'
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'
import connectDB from './config/database.js'
import { errorHandler } from './middleware/errorHandler.js'
import { notFound } from './middleware/notFound.js'

// Import routes
import authRoutes from './routes/auth.js'
import schoolsRoutes from './routes/schools.js'
import studentsRoutes from './routes/students.js'
import analyticsRoutes from './routes/analytics.js'
import leaderboardRoutes from './routes/leaderboard.js'
import settingsRoutes from './routes/settings.js'
import exportRoutes from './routes/export.js'
import healthRoutes from './routes/health.js'
import adminDbRoutes from './routes/adminDb.js'

// Load environment variables
dotenv.config()

const app = express()
const PORT = process.env.PORT || 5000

// Connect to MongoDB
connectDB()

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}))

// CORS configuration
const allowedOrigins = [
  'https://student-panel-frontend-eight.vercel.app',
  'https://student-panel-frontend-q1q9sldt4-noel-manojs-projects.vercel.app',
  'http://localhost:5173'
];

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      return callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions))

// Rate limiting (apply to public/core endpoints, not to admin DB explorer)
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 200,
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
})
app.use('/api/auth', limiter)
app.use('/api/leaderboard', limiter)
app.use('/api/health', limiter)

// Body parsing middleware
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

// Compression middleware
app.use(compression())

// Logging middleware
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('combined'))
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    version: '1.0.0'
  })
})

// API routes
app.use('/api/auth', authRoutes)
app.use('/api/schools', schoolsRoutes)
app.use('/api/students', studentsRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/leaderboard', leaderboardRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/export', exportRoutes)
app.use('/api/health', healthRoutes)
app.use('/api/admin/db', adminDbRoutes)

// API documentation endpoint
app.get('/api', (req, res) => {
  res.json({
    message: 'SpeakGenie Admin API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      schools: '/api/schools',
      students: '/api/students',
      analytics: '/api/analytics',
      leaderboard: '/api/leaderboard',
      settings: '/api/settings',
      export: '/api/export',
      health: '/api/health'
    },
    documentation: 'API documentation will be available here'
  })
})

// Welcome route
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the Student Panel Backend API!',
    status: 'OK',
    docs: '/api'
  });
});

// 404 handler
app.use(notFound)

// Error handling middleware
app.use(errorHandler)

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`)
  console.log(`📊 Environment: ${process.env.NODE_ENV}`)
  console.log(`🔗 API URL: http://localhost:${PORT}/api`)
  console.log(`🏥 Health Check: http://localhost:${PORT}/health`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully')
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully')
  process.exit(0)
})

export default app
