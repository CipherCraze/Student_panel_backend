import express from 'express'
import School from '../models/School.js'
import { protect } from '../middleware/auth.js'
import { canPerformCRUD, canViewData, canAccessSchool } from '../middleware/roleAuth.js'
import { body, validationResult } from 'express-validator'

const router = express.Router()

// Get all schools (with pagination and search) - Super admin can see all, school admin only their own
router.get('/', protect, canViewData, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', status = '', board = '' } = req.query
    let query = {}
    
    // School admins can only see their own school
    if (req.user.role === 'school_admin' && req.user.schoolId) {
      query._id = req.user.schoolId
    }
    
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { 'adminContact.name': { $regex: search, $options: 'i' } },
        { 'adminContact.email': { $regex: search, $options: 'i' } }
      ]
    }
    if (status) query.status = status
    if (board) query.board = board

    const schools = await School.find(query)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .sort({ createdAt: -1 })

    const total = await School.countDocuments(query)

    res.json({
      schools,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    })
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Get school by ID - School admin can only see their own school
router.get('/:id', protect, canViewData, canAccessSchool, async (req, res) => {
  try {
    const school = await School.findById(req.params.id)
    if (!school) return res.status(404).json({ message: 'School not found' })
    
    // School admins can only see their own school
    if (req.user.role === 'school_admin' && school._id.toString() !== req.user.schoolId.toString()) {
      return res.status(403).json({ message: 'Access denied. You can only view your own school.' })
    }
    
    res.json(school)
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Create new school - Super admin only
router.post('/', [
  protect,
  canPerformCRUD,
  body('name').notEmpty().withMessage('School name is required'),
  body('board').notEmpty().withMessage('Board is required'),
  body('adminContact.name').notEmpty().withMessage('Admin name is required'),
  body('adminContact.email').isEmail().withMessage('Valid admin email is required'),
  body('adminContact.phone').matches(/^\+?[1-9]\d{1,14}$/).withMessage('Valid phone number is required')
], async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

    const school = new School(req.body)
    await school.save()
    res.status(201).json(school)
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Update school - Super admin only
router.put('/:id', [
  protect,
  canPerformCRUD,
  body('name').optional().notEmpty().withMessage('School name cannot be empty'),
  body('adminContact.email').optional().isEmail().withMessage('Valid admin email is required'),
  body('adminContact.phone').optional().matches(/^\+?[1-9]\d{1,14}$/).withMessage('Valid phone number is required')
], async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

    const school = await School.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    )
    if (!school) return res.status(404).json({ message: 'School not found' })
    res.json(school)
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Delete school - Super admin only
router.delete('/:id', protect, canPerformCRUD, async (req, res) => {
  try {
    const school = await School.findByIdAndDelete(req.params.id)
    if (!school) {
      return res.status(404).json({ message: 'School not found' })
    }
    
    res.json({ message: 'School deleted successfully' })
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Get school statistics - Read-only for school admins
router.get('/stats/overview', protect, canViewData, canAccessSchool, async (req, res) => {
  try {
    const stats = await School.aggregate([
      {
        $group: {
          _id: null,
          totalSchools: { $sum: 1 },
          activeSchools: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
          inactiveSchools: { $sum: { $cond: [{ $eq: ['$status', 'inactive'] }, 1, 0] } },
          totalStudents: { $sum: '$totalStudents' },
          averageStudents: { $avg: '$totalStudents' }
        }
      }
    ])
    
    const boardStats = await School.aggregate([
      {
        $group: {
          _id: '$board',
          count: { $sum: 1 },
          totalStudents: { $sum: '$totalStudents' }
        }
      },
      { $sort: { count: -1 } }
    ])
    
    const recentSchools = await School.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .select('name board createdAt totalStudents')
    
    res.json({
      overview: stats[0] || {
        totalSchools: 0,
        activeSchools: 0,
        inactiveSchools: 0,
        totalStudents: 0,
        averageStudents: 0
      },
      boardStats,
      recentSchools
    })
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Search schools - Read-only for school admins
router.get('/search/advanced', protect, canViewData, canAccessSchool, async (req, res) => {
  try {
    const { 
      name, 
      board, 
      status, 
      minStudents, 
      maxStudents, 
      startDate, 
      endDate,
      sortBy = 'name',
      sortOrder = 'asc'
    } = req.query
    
    let query = {}
    
    // Text search
    if (name) {
      query.name = { $regex: name, $options: 'i' }
    }
    
    // Filters
    if (board) query.board = board
    if (status) query.status = status
    if (minStudents || maxStudents) {
      query.totalStudents = {}
      if (minStudents) query.totalStudents.$gte = parseInt(minStudents)
      if (maxStudents) query.totalStudents.$lte = parseInt(maxStudents)
    }
    
    // Date range
    if (startDate || endDate) {
      query.createdAt = {}
      if (startDate) query.createdAt.$gte = new Date(startDate)
      if (endDate) query.createdAt.$lte = new Date(endDate)
    }
    
    // Sorting
    const sort = {}
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1
    
    const schools = await School.find(query).sort(sort)
    
    res.json({
      schools,
      total: schools.length,
      filters: { name, board, status, minStudents, maxStudents, startDate, endDate }
    })
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

export default router
