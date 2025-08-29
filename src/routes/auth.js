import express from 'express'
import { body, validationResult } from 'express-validator'
import User from '../models/User.js'
import Admin from '../models/Admin.js'
import SchoolAdmin from '../models/SchoolAdmin.js'
import School from '../models/School.js'
import { protect } from '../middleware/auth.js'
import jwt from 'jsonwebtoken'

const router = express.Router()

// Register user (supports creating in our users collection and in company admins collection)
router.post('/register', [
  body('name').isLength({ min: 2 }).withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['super_admin', 'school_admin']).withMessage('Invalid role'),
  body('target').optional().isIn(['users','admins']).withMessage('Invalid target store')
], async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg })

    const { name, email, password, role = 'school_admin', target = 'users' } = req.body

    if (target === 'admins') {
      const existingAdmin = await Admin.findOne({ email })
      if (existingAdmin) return res.status(400).json({ success: false, message: 'Email already registered (admins)' })
    } else {
      const existing = await User.findOne({ email })
      if (existing) return res.status(400).json({ success: false, message: 'Email already registered' })
    }

    // Create in chosen collection
    let user
    if (target === 'admins') {
      // Admin collection stores bcrypt hash directly; use User model to hash, then reuse
      const temp = await User.create({ name, email, password, role })
      await Admin.create({ name, email, password: temp.password, isDeleted: false })
      user = temp
    } else {
      user = await User.create({ name, email, password, role })
    }

    const token = user.getSignedJwtToken()
    const refreshToken = user.getRefreshToken()
    user.refreshToken = refreshToken
    await user.save()

    res.status(201).json({ success: true, token, refreshToken, user: { id: user._id, name: user.name, email: user.email, role: user.role, schoolId: user.schoolId } })
  } catch (error) {
    console.error('Register error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

// Complete onboarding: create school and associate with user
router.post('/onboarding', [
  protect,
  body('schoolName').notEmpty().withMessage('School name is required'),
  body('board').notEmpty().withMessage('Board is required'),
  body('adminName').notEmpty().withMessage('Admin name is required'),
  body('adminEmail').isEmail().withMessage('Valid admin email is required'),
  body('adminPhone').notEmpty().withMessage('Admin phone is required')
], async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg })

    const { schoolName, board, adminName, adminEmail, adminPhone, schoolAddress, website, description } = req.body

    const allowedBoards = new Set(['CBSE', 'ICSE', 'State Board', 'IB', 'Cambridge', 'Other'])
    const safeBoard = allowedBoards.has(board) ? board : 'Other'
    const sanitizedPhone = (adminPhone || '').toString().replace(/[^+\d]/g, '')
    const address = typeof schoolAddress === 'object' && schoolAddress !== null
      ? schoolAddress
      : (schoolAddress ? { street: schoolAddress } : undefined)

    const school = await School.create({
      name: schoolName,
      board: safeBoard,
      adminContact: { name: adminName, email: adminEmail, phone: sanitizedPhone },
      ...(address ? { address } : {}),
      ...(website ? { website } : {}),
      ...(description ? { description } : {}),
      status: 'active'
    })

    const user = await User.findById(req.user.id)
    user.schoolId = school._id
    // Update display name from onboarding admin name for greeting consistency
    if (adminName && typeof adminName === 'string' && adminName.trim().length > 0) {
      user.name = adminName.trim()
    }
    await user.save()

    res.status(200).json({ success: true, user: { id: user._id, name: user.name, email: user.email, role: user.role, schoolId: user.schoolId } })
  } catch (error) {
    console.error('Onboarding error:', error)
    if (error?.name === 'ValidationError') {
      const first = Object.values(error.errors)[0]
      return res.status(400).json({ success: false, message: first?.message || 'Validation error' })
    }
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

// Login (check our users first; if not found, check company admins collection)
router.post('/login', [
  body('email').isEmail().withMessage('Please provide a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
], async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ success: false, message: errors.array()[0].msg })

    const { email, password } = req.body

    // Env single super admin support
    if (process.env.SUPER_ADMIN_EMAIL && process.env.SUPER_ADMIN_PASSWORD && email === process.env.SUPER_ADMIN_EMAIL && password === process.env.SUPER_ADMIN_PASSWORD) {
      const bcrypt = (await import('bcryptjs')).default
      const hashed = await bcrypt.hash(password, 10)
      const mirror = await User.findOneAndUpdate(
        { email },
        { name: 'Super Admin', email, password: hashed, role: 'super_admin', isActive: true },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      )
      const token = mirror.getSignedJwtToken()
      const refreshToken = mirror.getRefreshToken()
      mirror.refreshToken = refreshToken
      await mirror.save()
      return res.status(200).json({ success: true, token, refreshToken, user: { id: mirror._id, name: mirror.name, email: mirror.email, role: mirror.role, schoolId: mirror.schoolId } })
    }

    let user = await User.findOne({ email }).select('+password')

    if (!user) {
      // Fallback: check admins collection
      const admin = await Admin.findOne({ email, isDeleted: { $ne: true } })
      if (admin) {
        const bcrypt = (await import('bcryptjs')).default
        const ok = await bcrypt.compare(password, admin.password)
        if (!ok) return res.status(401).json({ success: false, message: 'Invalid credentials' })
        const upserted = await User.findOneAndUpdate(
          { email: admin.email },
          { name: admin.name || 'Admin', email: admin.email, password: admin.password, role: 'super_admin', isActive: true },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        ).select('+password')
        user = upserted
      }
    } else {
      if (!user.isActive) return res.status(401).json({ success: false, message: 'Account is deactivated' })
      const isMatch = await user.matchPassword(password)
      if (!isMatch) return res.status(401).json({ success: false, message: 'Invalid credentials' })
    }

    // Try school_admins collection if still not found
    if (!user) {
      const schoolAdmin = await SchoolAdmin.findOne({ email, isDeleted: { $ne: true } })
      if (schoolAdmin) {
        const bcrypt = (await import('bcryptjs')).default
        const ok = await bcrypt.compare(password, schoolAdmin.password)
        if (!ok) return res.status(401).json({ success: false, message: 'Invalid credentials' })
        const upserted = await User.findOneAndUpdate(
          { email: schoolAdmin.email },
          { name: schoolAdmin.name || 'School Admin', email: schoolAdmin.email, password: schoolAdmin.password, role: 'school_admin', isActive: true },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        ).select('+password')
        user = upserted
      }
    }

    if (!user) return res.status(401).json({ success: false, message: 'Invalid credentials' })

    await user.updateLastLogin()

    const token = user.getSignedJwtToken()
    const refreshToken = user.getRefreshToken()
    user.refreshToken = refreshToken
    await user.save()

    res.status(200).json({ success: true, token, refreshToken, user: { id: user._id, name: user.name, email: user.email, role: user.role, schoolId: user.schoolId } })
  } catch (error) {
    console.error('Login error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

// @desc    Logout user
// @route   POST /api/auth/logout
// @access  Private
router.post('/logout', protect, async (req, res) => {
  try {
    // Clear refresh token
    req.user.refreshToken = null
    await req.user.save()

    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    })
  } catch (error) {
    console.error('Logout error:', error)
    res.status(500).json({
      success: false,
      error: 'Server error'
    })
  }
})

// @desc    Refresh token
// @route   POST /api/auth/refresh
// @access  Public
router.post('/refresh', [
  body('refreshToken')
    .notEmpty()
    .withMessage('Refresh token is required')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: errors.array()[0].msg
      })
    }

    const { refreshToken } = req.body

    // Verify refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET)

    // Find user with this refresh token
    const user = await User.findById(decoded.id)
    if (!user || user.refreshToken !== refreshToken) {
      return res.status(401).json({
        success: false,
        error: 'Invalid refresh token'
      })
    }

    // Generate new tokens
    const newToken = user.getSignedJwtToken()
    const newRefreshToken = user.getRefreshToken()

    // Save new refresh token
    user.refreshToken = newRefreshToken
    await user.save()

    res.status(200).json({
      success: true,
      token: newToken,
      refreshToken: newRefreshToken
    })
  } catch (error) {
    console.error('Refresh token error:', error)
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid refresh token'
      })
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Refresh token expired'
      })
    }
    res.status(500).json({
      success: false,
      error: 'Server error'
    })
  }
})

// @desc    Get current user
// @route   GET /api/auth/me
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('schoolId', 'name board status')

    res.status(200).json({
      success: true,
      user
    })
  } catch (error) {
    console.error('Get current user error:', error)
    res.status(500).json({
      success: false,
      error: 'Server error'
    })
  }
})

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
router.put('/profile', protect, [
  body('name')
    .optional()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be between 2 and 50 characters'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please provide a valid email')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: errors.array()[0].msg
      })
    }

    const { name, email } = req.body

    // Check if email is already taken
    if (email && email !== req.user.email) {
      const existingUser = await User.findOne({ email })
      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: 'Email is already taken'
        })
      }
    }

    // Update user
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { name, email },
      { new: true, runValidators: true }
    ).populate('schoolId', 'name board status')

    res.status(200).json({
      success: true,
      user
    })
  } catch (error) {
    console.error('Update profile error:', error)
    res.status(500).json({
      success: false,
      error: 'Server error'
    })
  }
})

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
router.put('/change-password', protect, [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long')
], async (req, res) => {
  try {
    // Check for validation errors
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        error: errors.array()[0].msg
      })
    }

    const { currentPassword, newPassword } = req.body

    // Get user with password
    const user = await User.findById(req.user.id).select('+password')

    // Check current password
    const isMatch = await user.matchPassword(currentPassword)
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        error: 'Current password is incorrect'
      })
    }

    // Update password
    user.password = newPassword
    user.passwordChangedAt = Date.now()
    await user.save()

    res.status(200).json({
      success: true,
      message: 'Password changed successfully'
    })
  } catch (error) {
    console.error('Change password error:', error)
    res.status(500).json({
      success: false,
      error: 'Server error'
    })
  }
})

export default router

// Get current user
router.get('/me', protect, async (req, res) => {
  try {
    return res.status(200).json({
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
      schoolId: req.user.schoolId
    })
  } catch (error) {
    console.error('Me error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

// Logout
router.post('/logout', protect, async (req, res) => {
  try {
    req.user.refreshToken = undefined
    await req.user.save()
    return res.status(200).json({ success: true })
  } catch (error) {
    console.error('Logout error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})

// Refresh access token (simple dev version: re-issue based on current access token)
router.post('/refresh', protect, async (req, res) => {
  try {
    const token = req.user.getSignedJwtToken()
    return res.status(200).json({ token })
  } catch (error) {
    console.error('Refresh error:', error)
    res.status(500).json({ success: false, message: 'Server error' })
  }
})
