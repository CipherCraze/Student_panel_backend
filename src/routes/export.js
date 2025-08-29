import express from 'express'
import Student from '../models/Student.js'
import School from '../models/School.js'
import { protect } from '../middleware/auth.js'
import { body, validationResult } from 'express-validator'
import { createObjectCsvWriter as createCsvWriter } from 'csv-writer'
import path from 'path'
import { promises as fs } from 'fs'
import { fileURLToPath } from 'url'

const router = express.Router()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// Export students data
router.post('/students', [
  protect,
  body('format').isIn(['csv', 'pdf', 'json']).withMessage('Format must be csv, pdf, or json'),
  body('filters').optional().isObject(),
  body('fields').optional().isArray(),
  body('schoolId').optional().isMongoId()
], async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

    const { format, filters = {}, fields = [], schoolId } = req.body

    let query = {}
    if (schoolId) query.schoolId = schoolId
    if (filters.class) query.class = filters.class
    if (filters.gender) query['profile.gender'] = filters.gender
    if (filters.minAge || filters.maxAge) {
      query['profile.age'] = {}
      if (filters.minAge) query['profile.age'].$gte = parseInt(filters.minAge)
      if (filters.maxAge) query['profile.age'].$lte = parseInt(filters.maxAge)
    }
    if (filters.minAccuracy || filters.maxAccuracy) {
      query['performance.accuracyPercentage'] = {}
      if (filters.minAccuracy) query['performance.accuracyPercentage'].$gte = parseInt(filters.minAccuracy)
      if (filters.maxAccuracy) query['performance.accuracyPercentage'].$lte = parseInt(filters.maxAccuracy)
    }

    const students = await Student.find(query)
      .populate('schoolId', 'name board')
      .select(fields.length > 0 ? fields.join(' ') : 'name rollNumber gender class profile.age contactNumber parentName parentContact address enrollmentDate performance')

    if (students.length === 0) return res.status(404).json({ message: 'No students found matching the criteria' })

    const exportFields = fields.length > 0 ? fields : [ 'name', 'rollNumber', 'gender', 'class', 'age', 'contactNumber', 'parentName', 'parentContact', 'address', 'enrollmentDate', 'accuracyPercentage', 'lessonsCompleted', 'timeSpentMinutes', 'xpPoints' ]

    if (format === 'csv') {
      const csvData = students.map(student => {
        const row = {}
        exportFields.forEach(field => {
          if (field === 'accuracyPercentage') row[field] = student.performance?.accuracyPercentage || 0
          else if (field === 'lessonsCompleted') row[field] = student.performance?.lessonsCompleted || 0
          else if (field === 'timeSpentMinutes') row[field] = student.performance?.timeSpentMinutes || 0
          else if (field === 'xpPoints') row[field] = student.performance?.xpPoints || 0
          else if (field === 'age') row[field] = student.profile?.age || ''
          else if (field === 'schoolName') row[field] = student.schoolId?.name || 'N/A'
          else if (field === 'schoolBoard') row[field] = student.schoolId?.board || 'N/A'
          else row[field] = student[field] || 'N/A'
        })
        return row
      })

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `students_export_${timestamp}.csv`
      const filepath = path.join(__dirname, '../../temp', filename)
      await fs.mkdir(path.dirname(filepath), { recursive: true })

      const csvWriter = createCsvWriter({
        path: filepath,
        header: exportFields.map(field => ({ id: field, title: field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1') }))
      })
      await csvWriter.writeRecords(csvData)

      res.download(filepath, filename, (err) => {
        if (err) console.error('Error sending file:', err)
        fs.unlink(filepath).catch(() => {})
      })

    } else if (format === 'json') {
      const jsonData = students.map(student => {
        const exportStudent = {}
        exportFields.forEach(field => {
          if (field === 'accuracyPercentage') exportStudent[field] = student.performance?.accuracyPercentage || 0
          else if (field === 'lessonsCompleted') exportStudent[field] = student.performance?.lessonsCompleted || 0
          else if (field === 'timeSpentMinutes') exportStudent[field] = student.performance?.timeSpentMinutes || 0
          else if (field === 'xpPoints') exportStudent[field] = student.performance?.xpPoints || 0
          else if (field === 'age') exportStudent[field] = student.profile?.age || ''
          else if (field === 'schoolName') exportStudent[field] = student.schoolId?.name || 'N/A'
          else if (field === 'schoolBoard') exportStudent[field] = student.schoolId?.board || 'N/A'
          else exportStudent[field] = student[field] || 'N/A'
        })
        return exportStudent
      })

      res.json({ format: 'json', totalStudents: jsonData.length, filters, fields: exportFields, data: jsonData })

    } else if (format === 'pdf') {
      res.json({ message: 'PDF export is not yet implemented. Please use CSV or JSON format.', supportedFormats: ['csv', 'json'] })
    }

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Export schools data
router.post('/schools', [
  protect,
  body('format').isIn(['csv', 'json']).withMessage('Format must be csv or json'),
  body('filters').optional().isObject(),
  body('fields').optional().isArray()
], async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

    const { format, filters = {}, fields = [] } = req.body

    let query = {}
    if (filters.status) query.status = filters.status
    if (filters.board) query.board = filters.board
    if (filters.minStudents || filters.maxStudents) {
      query.totalStudents = {}
      if (filters.minStudents) query.totalStudents.$gte = parseInt(filters.minStudents)
      if (filters.maxStudents) query.totalStudents.$lte = parseInt(filters.maxStudents)
    }

    const schools = await School.find(query)
      .select(fields.length > 0 ? fields.join(' ') : 'name board adminContact totalStudents status createdAt address website description')

    if (schools.length === 0) return res.status(404).json({ message: 'No schools found matching the criteria' })

    const exportFields = fields.length > 0 ? fields : [ 'name', 'board', 'adminName', 'adminEmail', 'adminPhone', 'totalStudents', 'status', 'createdAt', 'address', 'website', 'description' ]

    if (format === 'csv') {
      const csvData = schools.map(school => {
        const row = {}
        exportFields.forEach(field => {
          if (field === 'adminName') row[field] = school.adminContact?.name || 'N/A'
          else if (field === 'adminEmail') row[field] = school.adminContact?.email || 'N/A'
          else if (field === 'adminPhone') row[field] = school.adminContact?.phone || 'N/A'
          else if (field === 'address') row[field] = school.address ? `${school.address.street}, ${school.address.city}, ${school.address.state}` : 'N/A'
          else row[field] = school[field] || 'N/A'
        })
        return row
      })

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `schools_export_${timestamp}.csv`
      const filepath = path.join(__dirname, '../../temp', filename)
      await fs.mkdir(path.dirname(filepath), { recursive: true })

      const csvWriter = createCsvWriter({
        path: filepath,
        header: exportFields.map(field => ({ id: field, title: field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1') }))
      })
      await csvWriter.writeRecords(csvData)

      res.download(filepath, filename, (err) => {
        if (err) console.error('Error sending file:', err)
        fs.unlink(filepath).catch(() => {})
      })

    } else if (format === 'json') {
      const jsonData = schools.map(school => {
        const exportSchool = {}
        exportFields.forEach(field => {
          if (field === 'adminName') exportSchool[field] = school.adminContact?.name || 'N/A'
          else if (field === 'adminEmail') exportSchool[field] = school.adminContact?.email || 'N/A'
          else if (field === 'adminPhone') exportSchool[field] = school.adminContact?.phone || 'N/A'
          else if (field === 'address') exportSchool[field] = school.address ? `${school.address.street}, ${school.address.city}, ${school.address.state}` : 'N/A'
          else exportSchool[field] = school[field] || 'N/A'
        })
        return exportSchool
      })

      res.json({ format: 'json', totalSchools: jsonData.length, filters, fields: exportFields, data: jsonData })
    }

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Export analytics data
router.post('/analytics', [
  protect,
  body('format').isIn(['csv', 'json']).withMessage('Format must be csv or json'),
  body('type').isIn(['performance', 'engagement', 'comparative', 'overview']).withMessage('Type must be performance, engagement, comparative, or overview'),
  body('schoolId').optional().isMongoId(),
  body('dateRange').optional().isObject()
], async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

    const { format, type, schoolId, dateRange } = req.body

    let analyticsData = {}

    if (type === 'overview') {
      // Get overview analytics
      let schoolQuery = {}
      let studentQuery = {}

      if (schoolId) {
        schoolQuery._id = schoolId
        studentQuery.schoolId = schoolId
      }

      const schoolStats = await School.aggregate([
        { $match: schoolQuery },
        {
          $group: {
            _id: null,
            totalSchools: { $sum: 1 },
            activeSchools: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
            totalStudents: { $sum: '$totalStudents' }
          }
        }
      ])

      const studentStats = await Student.aggregate([
        { $match: studentQuery },
        {
          $group: {
            _id: null,
            totalStudents: { $sum: 1 },
            averageAccuracy: { $avg: '$performance.accuracyPercentage' },
            totalLessons: { $sum: '$performance.lessonsCompleted' }
          }
        }
      ])

      analyticsData = {
        overview: {
          schools: schoolStats[0] || { totalSchools: 0, activeSchools: 0, totalStudents: 0 },
          students: studentStats[0] || { totalStudents: 0, averageAccuracy: 0, totalLessons: 0 }
        }
      }

    } else if (type === 'performance') {
      // Get performance analytics
      let query = {}
      if (schoolId) query.schoolId = schoolId

      const performanceDistribution = await Student.aggregate([
        { $match: query },
        {
          $group: {
            _id: {
              $switch: {
                branches: [
                  { case: { $gte: ['$performance.accuracyPercentage', 90] }, then: 'excellent' },
                  { case: { $gte: ['$performance.accuracyPercentage', 75] }, then: 'good' },
                  { case: { $gte: ['$performance.accuracyPercentage', 60] }, then: 'average' },
                  { case: { $gte: ['$performance.accuracyPercentage', 0] }, then: 'needsImprovement' }
                ],
                default: 'needsImprovement'
              }
            },
            count: { $sum: 1 },
            averageAccuracy: { $avg: '$performance.accuracyPercentage' }
          }
        }
      ])

      analyticsData = {
        performance: {
          distribution: performanceDistribution,
          totalStudents: performanceDistribution.reduce((sum, item) => sum + item.count, 0)
        }
      }

    } else if (type === 'engagement') {
      // Get engagement analytics
      let query = {}
      if (schoolId) query.schoolId = schoolId

      const engagementTrends = await Student.aggregate([
        { $match: query },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$enrollmentDate' } },
            count: { $sum: 1 },
            avgTime: { $avg: '$performance.timeSpentMinutes' },
            avgLessons: { $avg: '$performance.lessonsCompleted' }
          }
        },
        { $sort: { _id: 1 } },
        { $limit: 12 }
      ])

      analyticsData = {
        engagement: {
          trends: engagementTrends,
          totalPeriods: engagementTrends.length
        }
      }
    }

    if (format === 'csv') {
      // Convert analytics data to CSV format
      const csvData = convertAnalyticsToCSV(analyticsData, type)

      // Create CSV file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `analytics_${type}_${timestamp}.csv`
      const filepath = path.join(__dirname, '../../temp', filename)

      // Ensure temp directory exists
      await fs.mkdir(path.dirname(filepath), { recursive: true })

      const csvWriterInstance = createCsvWriter({
        path: filepath,
        header: Object.keys(csvData[0] || {}).map(key => ({
          id: key,
          title: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')
        }))
      })

      await csvWriterInstance.writeRecords(csvData)

      // Send file
      res.download(filepath, filename, (err) => {
        if (err) {
          console.error('Error sending file:', err)
        }
        // Clean up file after sending
        fs.unlink(filepath).catch(console.error)
      })

    } else if (format === 'json') {
      res.json({
        format: 'json',
        type,
        schoolId,
        dateRange,
        data: analyticsData
      })
    }

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Export leaderboard data
router.post('/leaderboard', [
  protect,
  body('format').isIn(['csv', 'json']).withMessage('Format must be csv or json'),
  body('type').isIn(['students', 'schools', 'classes']).withMessage('Type must be students, schools, or classes'),
  body('schoolId').optional().isMongoId(),
  body('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const errors = validationResult(req)
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

    const { format, type, schoolId, limit = 20 } = req.body

    let leaderboardData = []

    if (type === 'students') {
      let query = {}
      if (schoolId) query.schoolId = schoolId

      const topStudents = await Student.find(query)
        .sort({ 'performance.xpPoints': -1 })
        .limit(limit)
        .populate('schoolId', 'name board')
        .select('name class schoolId performance rollNumber gender')

      leaderboardData = topStudents.map((student, index) => ({
        rank: index + 1,
        name: student.name,
        class: student.class,
        school: student.schoolId?.name || 'N/A',
        rollNumber: student.rollNumber,
        gender: student.gender,
        xpPoints: student.performance.xpPoints,
        accuracy: student.performance.accuracyPercentage,
        lessonsCompleted: student.performance.lessonsCompleted
      }))

    } else if (type === 'schools') {
      const topSchools = await School.aggregate([
        { $match: { totalStudents: { $gte: 0 } } },
        {
          $lookup: {
            from: 'students',
            localField: '_id',
            foreignField: 'schoolId',
            as: 'students'
          }
        },
        {
          $addFields: {
            averageAccuracy: { $avg: '$students.performance.accuracyPercentage' },
            totalLessons: { $sum: '$students.performance.lessonsCompleted' }
          }
        },
        { $sort: { averageAccuracy: -1 } },
        { $limit: limit }
      ])

      leaderboardData = topSchools.map((school, index) => ({
        rank: index + 1,
        name: school.name,
        board: school.board,
        totalStudents: school.totalStudents,
        averageAccuracy: Math.round(school.averageAccuracy || 0),
        totalLessons: school.totalLessons || 0
      }))
    }

    if (format === 'csv') {
      // Create CSV file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
      const filename = `leaderboard_${type}_${timestamp}.csv`
      const filepath = path.join(__dirname, '../../temp', filename)

      // Ensure temp directory exists
      await fs.mkdir(path.dirname(filepath), { recursive: true })

      const csvWriterInstance = createCsvWriter({
        path: filepath,
        header: Object.keys(leaderboardData[0] || {}).map(key => ({
          id: key,
          title: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1')
        }))
      })

      await csvWriterInstance.writeRecords(leaderboardData)

      // Send file
      res.download(filepath, filename, (err) => {
        if (err) {
          console.error('Error sending file:', err)
        }
        // Clean up file after sending
        fs.unlink(filepath).catch(console.error)
      })

    } else if (format === 'json') {
      res.json({
        format: 'json',
        type,
        schoolId,
        limit,
        data: leaderboardData
      })
    }

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Helper function to convert analytics data to CSV format
function convertAnalyticsToCSV(analyticsData, type) {
  if (type === 'overview') {
    return [
      {
        metric: 'Total Schools',
        value: analyticsData.overview.schools.totalSchools
      },
      {
        metric: 'Active Schools',
        value: analyticsData.overview.schools.activeSchools
      },
      {
        metric: 'Total Students',
        value: analyticsData.overview.students.totalStudents
      },
      {
        metric: 'Average Accuracy',
        value: Math.round(analyticsData.overview.students.averageAccuracy || 0)
      },
      {
        metric: 'Total Lessons',
        value: analyticsData.overview.students.totalLessons
      }
    ]
  } else if (type === 'performance') {
    return analyticsData.performance.distribution.map(item => ({
      performance_level: item._id,
      student_count: item.count,
      average_accuracy: Math.round(item.averageAccuracy || 0)
    }))
  } else if (type === 'engagement') {
    return analyticsData.engagement.trends.map(trend => ({
      period: trend._id,
      new_students: trend.count,
      average_time_minutes: Math.round(trend.avgTime || 0),
      average_lessons: Math.round(trend.avgLessons || 0)
    }))
  }

  return []
}

export default router
