import express from 'express'

const router = express.Router()

// @desc    Health check
// @route   GET /api/health
// @access  Public
router.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0'
  })
})

export default router
