import express from 'express'
import User from '../models/User.js'
import { protect } from '../middleware/auth.js'
import { body, validationResult } from 'express-validator'

const router = express.Router()

// Get user settings
router.get('/user', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password')
    if (!user) return res.status(404).json({ message: 'User not found' })

    const defaultSettings = {
      notifications: { email: true, performance: true, newSchools: false, achievements: true, leaderboard: true },
      language: 'English',
      timezone: 'UTC+5:30',
      theme: 'light',
      dashboard: { defaultView: 'overview', refreshInterval: 300, showCharts: true, showNotifications: true },
      privacy: { profileVisibility: 'school', performanceSharing: true, leaderboardVisibility: true }
    }

    const userSettings = { ...defaultSettings, ...(user.settings || {}) }
    res.json({ userId: user._id, email: user.email, name: user.name, role: user.role, settings: userSettings, lastUpdated: user.settingsUpdatedAt || user.createdAt })
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Update user settings
router.put('/user', [
  protect,
  body('notifications.email').optional().isBoolean(),
  body('language').optional().isString(),
], async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

    const user = await User.findById(req.user.id)
    if (!user) return res.status(404).json({ message: 'User not found' })

    user.settings = { ...(user.settings || {}), ...req.body }
    user.settingsUpdatedAt = new Date()
    await user.save()

    res.json({ message: 'Settings updated successfully', settings: user.settings, lastUpdated: user.settingsUpdatedAt })
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Reset user settings to default
router.post('/user/reset', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }
    
    // Remove custom settings
    user.settings = undefined
    user.settingsUpdatedAt = undefined
    await user.save()
    
    res.json({
      message: 'Settings reset to default successfully',
      settings: null
    })
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Get system settings (for super admin)
router.get('/system', protect, async (req, res) => {
  try {
    // Check if user is super admin
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Access denied. Super admin required.' })
    }
    
    // Default system settings
    const defaultSystemSettings = {
      maintenance: {
        enabled: false,
        message: '',
        startTime: null,
        endTime: null
      },
      features: {
        analytics: true,
        export: true,
        realTime: true,
        notifications: true,
        leaderboard: true,
        achievements: true
      },
      security: {
        passwordPolicy: {
          minLength: 8,
          requireUppercase: true,
          requireLowercase: true,
          requireNumbers: true,
          requireSpecialChars: false
        },
        sessionTimeout: 3600,
        maxLoginAttempts: 5,
        lockoutDuration: 900
      },
      limits: {
        maxStudentsPerSchool: 10000,
        maxSchoolsPerAccount: 100,
        maxFileSize: 10485760, // 10MB
        maxStoragePerSchool: 1073741824 // 1GB
      },
      integrations: {
        email: {
          provider: 'smtp',
          enabled: true,
          config: {}
        },
        sms: {
          provider: 'twilio',
          enabled: false,
          config: {}
        }
      },
      version: '1.0.0',
      lastUpdated: new Date()
    }
    
    // In a real application, these would be stored in a separate collection
    // For now, we'll return the default settings
    res.json({
      settings: defaultSystemSettings,
      environment: process.env.NODE_ENV || 'development',
      serverTime: new Date(),
      uptime: process.uptime()
    })
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Update system settings (for super admin)
router.put('/system', [
  protect,
  body('maintenance.enabled').optional().isBoolean(),
  body('maintenance.message').optional().isString().isLength({ max: 500 }),
  body('features.*').optional().isBoolean(),
  body('security.passwordPolicy.minLength').optional().isInt({ min: 6, max: 20 }),
  body('security.passwordPolicy.requireUppercase').optional().isBoolean(),
  body('security.passwordPolicy.requireLowercase').optional().isBoolean(),
  body('security.passwordPolicy.requireNumbers').optional().isBoolean(),
  body('security.passwordPolicy.requireSpecialChars').optional().isBoolean(),
  body('security.sessionTimeout').optional().isInt({ min: 300, max: 86400 }),
  body('security.maxLoginAttempts').optional().isInt({ min: 3, max: 10 }),
  body('security.lockoutDuration').optional().isInt({ min: 300, max: 3600 }),
  body('limits.maxStudentsPerSchool').optional().isInt({ min: 100, max: 100000 }),
  body('limits.maxSchoolsPerAccount').optional().isInt({ min: 1, max: 1000 }),
  body('limits.maxFileSize').optional().isInt({ min: 1048576, max: 104857600 }),
  body('limits.maxStoragePerSchool').optional().isInt({ min: 104857600, max: 10737418240 })
], async (req, res) => {
  try {
    // Check if user is super admin
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ message: 'Access denied. Super admin required.' })
    }
    
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() })
    }
    
    // In a real application, these would be stored in a separate collection
    // For now, we'll just validate and return success
    
    res.json({
      message: 'System settings updated successfully',
      updatedFields: Object.keys(req.body),
      timestamp: new Date()
    })
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Get notification preferences
router.get('/notifications', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('settings notifications')
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }
    
    const defaultNotifications = {
      email: true,
      performance: true,
      newSchools: false,
      achievements: true,
      leaderboard: true,
      system: true,
      updates: false
    }
    
    const userNotifications = {
      ...defaultNotifications,
      ...user.settings?.notifications
    }
    
    res.json({
      userId: user._id,
      notifications: userNotifications,
      lastUpdated: user.settingsUpdatedAt || user.createdAt
    })
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Update notification preferences
router.put('/notifications', [
  protect,
  body('email').optional().isBoolean(),
  body('performance').optional().isBoolean(),
  body('newSchools').optional().isBoolean(),
  body('achievements').optional().isBoolean(),
  body('leaderboard').optional().isBoolean(),
  body('system').optional().isBoolean(),
  body('updates').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() })
    }
    
    const user = await User.findById(req.user.id)
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }
    
    // Initialize settings if they don't exist
    if (!user.settings) {
      user.settings = {}
    }
    if (!user.settings.notifications) {
      user.settings.notifications = {}
    }
    
    // Update notification settings
    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined) {
        user.settings.notifications[key] = req.body[key]
      }
    })
    
    user.settingsUpdatedAt = new Date()
    await user.save()
    
    res.json({
      message: 'Notification preferences updated successfully',
      notifications: user.settings.notifications,
      lastUpdated: user.settingsUpdatedAt
    })
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Get privacy settings
router.get('/privacy', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('settings privacy')
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }
    
    const defaultPrivacy = {
      profileVisibility: 'school',
      performanceSharing: true,
      leaderboardVisibility: true,
      dataAnalytics: true,
      thirdPartySharing: false
    }
    
    const userPrivacy = {
      ...defaultPrivacy,
      ...user.settings?.privacy
    }
    
    res.json({
      userId: user._id,
      privacy: userPrivacy,
      lastUpdated: user.settingsUpdatedAt || user.createdAt
    })
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Update privacy settings
router.put('/privacy', [
  protect,
  body('profileVisibility').optional().isIn(['private', 'school', 'public']),
  body('performanceSharing').optional().isBoolean(),
  body('leaderboardVisibility').optional().isBoolean(),
  body('dataAnalytics').optional().isBoolean(),
  body('thirdPartySharing').optional().isBoolean()
], async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() })
    }
    
    const user = await User.findById(req.user.id)
    if (!user) {
      return res.status(404).json({ message: 'User not found' })
    }
    
    // Initialize settings if they don't exist
    if (!user.settings) {
      user.settings = {}
    }
    if (!user.settings.privacy) {
      user.settings.privacy = {}
    }
    
    // Update privacy settings
    Object.keys(req.body).forEach(key => {
      if (req.body[key] !== undefined) {
        user.settings.privacy[key] = req.body[key]
      }
    })
    
    user.settingsUpdatedAt = new Date()
    await user.save()
    
    res.json({
      message: 'Privacy settings updated successfully',
      privacy: user.settings.privacy,
      lastUpdated: user.settingsUpdatedAt
    })
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Get available languages
router.get('/languages', protect, async (req, res) => {
  try {
    const languages = [
      { code: 'en', name: 'English', nativeName: 'English' },
      { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
      { code: 'es', name: 'Spanish', nativeName: 'Español' },
      { code: 'fr', name: 'French', nativeName: 'Français' },
      { code: 'de', name: 'German', nativeName: 'Deutsch' },
      { code: 'zh', name: 'Chinese', nativeName: '中文' },
      { code: 'ja', name: 'Japanese', nativeName: '日本語' },
      { code: 'ko', name: 'Korean', nativeName: '한국어' }
    ]
    
    res.json({
      languages,
      defaultLanguage: 'en',
      supportedLanguages: languages.map(lang => lang.code)
    })
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Get available timezones
router.get('/timezones', protect, async (req, res) => {
  try {
    const timezones = [
      { value: 'UTC+5:30', label: 'India Standard Time (UTC+5:30)', offset: 330 },
      { value: 'UTC+0', label: 'UTC (UTC+0)', offset: 0 },
      { value: 'UTC-5', label: 'Eastern Time (UTC-5)', offset: -300 },
      { value: 'UTC-8', label: 'Pacific Time (UTC-8)', offset: -480 },
      { value: 'UTC+1', label: 'Central European Time (UTC+1)', offset: 60 },
      { value: 'UTC+8', label: 'China Standard Time (UTC+8)', offset: 480 },
      { value: 'UTC+9', label: 'Japan Standard Time (UTC+9)', offset: 540 }
    ]
    
    res.json({
      timezones,
      defaultTimezone: 'UTC+5:30',
      currentServerTime: new Date(),
      currentServerTimezone: 'UTC'
    })
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

export default router
