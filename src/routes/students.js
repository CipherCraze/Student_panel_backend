import express from 'express'
import mongoose from 'mongoose'
import Student from '../models/Student.js'
import School from '../models/School.js'
import { protect } from '../middleware/auth.js'
import { canPerformCRUD, canViewData, canAccessSchool } from '../middleware/roleAuth.js'
import { body, validationResult } from 'express-validator'

const router = express.Router()

// Get all students (with pagination, filtering, and search) - Read-only for school admins
router.get('/', protect, canViewData, canAccessSchool, async (req, res) => {
  try {
    const { page = 1, limit = 10, search = '', class: className = '', schoolId = '', gender = '', minAge = '', maxAge = '', sortBy = 'name', sortOrder = 'asc' } = req.query

    let query = {}
    
    // School admins can only see their own school's students
    if (req.user.role === 'school_admin') {
      query.schoolId = req.user.schoolId
    } else if (schoolId) {
      query.schoolId = schoolId
    }
    
    if (search) {
      query.$or = [ { name: { $regex: search, $options: 'i' } }, { rollNumber: { $regex: search, $options: 'i' } }, { parentName: { $regex: search, $options: 'i' } } ]
    }
    if (className) query.class = className
    if (gender) query['profile.gender'] = gender
    if (minAge || maxAge) {
      query['profile.age'] = {}
      if (minAge) query['profile.age'].$gte = parseInt(minAge)
      if (maxAge) query['profile.age'].$lte = parseInt(maxAge)
    }

    const sort = {}; sort[sortBy] = sortOrder === 'desc' ? -1 : 1

    const students = await Student.find(query).limit(limit * 1).skip((page - 1) * limit).sort(sort).populate('schoolId', 'name board')
    const total = await Student.countDocuments(query)

    res.json({ students, totalPages: Math.ceil(total / limit), currentPage: parseInt(page), total })
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Get student by ID - Read-only for school admins
router.get('/:id', protect, canViewData, canAccessSchool, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id).populate('schoolId', 'name board address')
    if (!student) return res.status(404).json({ message: 'Student not found' })
    
    // School admins can only see students from their school
    if (req.user.role === 'school_admin' && student.schoolId.toString() !== req.user.schoolId.toString()) {
      return res.status(403).json({ message: 'Access denied. You can only view students from your own school.' })
    }
    
    res.json(student)
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Create new student - Super admin only
router.post('/', [
  protect,
  canPerformCRUD,
  body('name').notEmpty(),
  body('rollNumber').notEmpty(),
  body('gender').isIn(['male', 'female', 'other']),
  body('class').notEmpty(),
  body('age').optional().isInt({ min: 3, max: 25 }),
  body('schoolId').optional().isMongoId()
], async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

    const exists = await Student.findOne({ rollNumber: req.body.rollNumber, schoolId: req.body.schoolId, class: req.body.class })
    if (exists) return res.status(400).json({ message: 'Student with this roll number already exists in the same class and school' })

    let schoolId = req.body.schoolId
    if (!schoolId && req.user?.schoolId) schoolId = req.user.schoolId

    const school = await School.findById(schoolId)
    if (!school) return res.status(400).json({ message: 'School not found' })

    const { name, rollNumber, gender, class: className, age } = req.body
    const student = new Student({
      name,
      rollNumber,
      class: className,
      schoolId,
      profile: { age, gender },
      contactNumber: req.body.contactNumber,
      parentName: req.body.parentName,
      parentContact: req.body.parentContact,
      address: req.body.address,
    })
    await student.save()
    await School.findByIdAndUpdate(schoolId, { $inc: { totalStudents: 1 } })

    const populated = await Student.findById(student._id).populate('schoolId', 'name board')
    res.status(201).json(populated)
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Update student - Super admin only
router.put('/:id', [protect, canPerformCRUD], async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() })
    }
    
    const student = await Student.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    ).populate('schoolId', 'name board')
    
    if (!student) {
      return res.status(404).json({ message: 'Student not found' })
    }
    
    res.json(student)
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Delete student - Super admin only
router.delete('/:id', protect, canPerformCRUD, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
    if (!student) {
      return res.status(404).json({ message: 'Student not found' })
    }
    
    // Update school's total students count
    await School.findByIdAndUpdate(
      student.schoolId,
      { $inc: { totalStudents: -1 } }
    )
    
    await Student.findByIdAndDelete(req.params.id)
    
    res.json({ message: 'Student deleted successfully' })
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Bulk operations - Super admin only
router.post('/bulk', protect, canPerformCRUD, async (req, res) => {
  try {
    const { operation, studentIds, data } = req.body
    
    if (!operation || !studentIds || !Array.isArray(studentIds)) {
      return res.status(400).json({ message: 'Invalid bulk operation parameters' })
    }
    
    let result
    
    switch (operation) {
      case 'update':
        result = await Student.updateMany(
          { _id: { $in: studentIds } },
          data
        )
        break
        
      case 'delete':
        // Get students to update school counts
        const students = await Student.find({ _id: { $in: studentIds } })
        
        // Group by school and update counts
        const schoolUpdates = {}
        students.forEach(student => {
          if (student.schoolId) {
            schoolUpdates[student.schoolId] = (schoolUpdates[student.schoolId] || 0) - 1
          }
        })
        
        // Update school counts
        for (const [schoolId, change] of Object.entries(schoolUpdates)) {
          await School.findByIdAndUpdate(schoolId, { $inc: { totalStudents: change } })
        }
        
        result = await Student.deleteMany({ _id: { $in: studentIds } })
        break
        
      default:
        return res.status(400).json({ message: 'Invalid operation' })
    }
    
    res.json({ 
      message: `Bulk ${operation} completed successfully`,
      affectedCount: result.modifiedCount || result.deletedCount
    })
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Performance tracking - Read-only for school admins
router.get('/:id/performance', protect, canViewData, canAccessSchool, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id)
    if (!student) {
      return res.status(404).json({ message: 'Student not found' })
    }
    
    // Calculate performance metrics
    const performance = {
      current: student.performance,
      trends: {
        accuracy: student.performance.accuracyPercentage,
        lessons: student.performance.lessonsCompleted,
        timeSpent: student.performance.timeSpentMinutes,
        xpPoints: student.performance.xpPoints
      },
      skillBreakdown: student.performance.skillAreas,
      overallScore: Math.round(
        Object.values(student.performance.skillAreas).reduce((a, b) => a + b, 0) / 5
      )
    }
    
    res.json(performance)
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Update performance - Super admin only
router.put('/:id/performance', [
  protect,
  canPerformCRUD,
  body('performance.accuracyPercentage').optional().isInt({ min: 0, max: 100 }),
  body('performance.lessonsCompleted').optional().isInt({ min: 0 }),
  body('performance.timeSpentMinutes').optional().isInt({ min: 0 }),
  body('performance.xpPoints').optional().isInt({ min: 0 }),
  body('performance.skillAreas.*').optional().isInt({ min: 0, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() })
    }
    
    const student = await Student.findByIdAndUpdate(
      req.params.id,
      { performance: req.body.performance },
      { new: true, runValidators: true }
    )
    
    if (!student) {
      return res.status(404).json({ message: 'Student not found' })
    }
    
    res.json(student.performance)
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Get student statistics - Read-only for school admins
router.get('/stats/overview', protect, canViewData, canAccessSchool, async (req, res) => {
  try {
    const { schoolId } = req.query
    let query = {}
    if (schoolId) {
      try {
        query.schoolId = new mongoose.Types.ObjectId(String(schoolId))
      } catch (_) {
        return res.status(400).json({ message: 'Invalid schoolId' })
      }
    } else if (req.user?.role === 'school_admin' && req.user.schoolId) {
      // Default to the admin's school if not provided
      query.schoolId = new mongoose.Types.ObjectId(String(req.user.schoolId))
    }
    
    const stats = await Student.aggregate([
      { $match: query },
      {
        $project: {
          class: 1,
          'profile.age': 1,
          'profile.gender': 1,
          'performance.accuracyPercentage': {
            $convert: { input: '$performance.accuracyPercentage', to: 'double', onError: null, onNull: null }
          },
          'performance.lessonsCompleted': {
            $convert: { input: '$performance.lessonsCompleted', to: 'double', onError: 0, onNull: 0 }
          },
          'performance.xpPoints': {
            $convert: { input: '$performance.xpPoints', to: 'double', onError: 0, onNull: 0 }
          }
        }
      },
      {
        $group: {
          _id: null,
          totalStudents: { $sum: 1 },
          averageAge: { $avg: { $ifNull: ['$profile.age', null] } },
          genderDistribution: {
            male: { $sum: { $cond: [{ $eq: [{ $ifNull: ['$profile.gender', null] }, 'male'] }, 1, 0] } },
            female: { $sum: { $cond: [{ $eq: [{ $ifNull: ['$profile.gender', null] }, 'female'] }, 1, 0] } },
            other: { $sum: { $cond: [{ $eq: [{ $ifNull: ['$profile.gender', null] }, 'other'] }, 1, 0] } }
          },
          classDistribution: { $addToSet: '$class' },
          averageAccuracy: { $avg: { $ifNull: ['$performance.accuracyPercentage', null] } },
          totalLessons: { $sum: { $ifNull: ['$performance.lessonsCompleted', 0] } },
          totalXP: { $sum: { $ifNull: ['$performance.xpPoints', 0] } }
        }
      }
    ])
    
    const classStats = await Student.aggregate([
      { $match: query },
      {
        $project: {
          class: 1,
          'performance.accuracyPercentage': {
            $convert: { input: '$performance.accuracyPercentage', to: 'double', onError: null, onNull: null }
          },
          'performance.lessonsCompleted': {
            $convert: { input: '$performance.lessonsCompleted', to: 'double', onError: 0, onNull: 0 }
          }
        }
      },
      {
        $group: {
          _id: '$class',
          count: { $sum: 1 },
          averageAccuracy: { $avg: { $ifNull: ['$performance.accuracyPercentage', null] } },
          totalLessons: { $sum: { $ifNull: ['$performance.lessonsCompleted', 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ])
    
    res.json({
      overview: stats[0] || {
        totalStudents: 0,
        averageAge: 0,
        genderDistribution: { male: 0, female: 0, other: 0 },
        classDistribution: [],
        averageAccuracy: 0,
        totalLessons: 0,
        totalXP: 0
      },
      classStats
    })
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Search students - Read-only for school admins
router.get('/search/advanced', protect, canViewData, canAccessSchool, async (req, res) => {
  try {
    const { 
      name, 
      rollNumber, 
      class: className, 
      schoolId,
      gender,
      minAge,
      maxAge,
      minAccuracy,
      maxAccuracy,
      sortBy = 'name',
      sortOrder = 'asc'
    } = req.query
    
    let query = {}
    
    // Text search
    if (name) {
      query.name = { $regex: name, $options: 'i' }
    }
    if (rollNumber) {
      query.rollNumber = { $regex: rollNumber, $options: 'i' }
    }
    
    // Filters
    if (className) query.class = className
    if (schoolId) query.schoolId = schoolId
    if (gender) query.gender = gender
    
    // Age range
    if (minAge || maxAge) {
      query.age = {}
      if (minAge) query.age.$gte = parseInt(minAge)
      if (maxAge) query.age.$lte = parseInt(maxAge)
    }
    
    // Performance filters
    if (minAccuracy || maxAccuracy) {
      query['performance.accuracyPercentage'] = {}
      if (minAccuracy) query['performance.accuracyPercentage'].$gte = parseInt(minAccuracy)
      if (maxAccuracy) query['performance.accuracyPercentage'].$lte = parseInt(maxAccuracy)
    }
    
    // Sorting
    const sort = {}
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1
    
    const students = await Student.find(query)
      .sort(sort)
      .populate('schoolId', 'name board')
    
    res.json({
      students,
      total: students.length,
      filters: { name, rollNumber, className, schoolId, gender, minAge, maxAge, minAccuracy, maxAccuracy }
    })
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

export default router
