import express from 'express'
import Student from '../models/Student.js'
import School from '../models/School.js'
import { protect } from '../middleware/auth.js'

const router = express.Router()

// Get top students leaderboard
router.get('/students/top', protect, async (req, res) => {
  try {
    const { limit = 10, schoolId = '', class: className = '', period = 'all', sortBy = 'xpPoints' } = req.query

    let query = {}
    if (schoolId) query.schoolId = schoolId
    if (className) query.class = className

    if (period === 'monthly') {
      const lastMonth = new Date(); lastMonth.setMonth(lastMonth.getMonth() - 1)
      query.enrollmentDate = { $gte: lastMonth.toISOString() }
    } else if (period === 'weekly') {
      const lastWeek = new Date(); lastWeek.setDate(lastWeek.getDate() - 7)
      query.enrollmentDate = { $gte: lastWeek.toISOString() }
    }

    let sortField = 'performance.xpPoints'
    if (sortBy === 'accuracy') sortField = 'performance.accuracyPercentage'
    else if (sortBy === 'lessons') sortField = 'performance.lessonsCompleted'
    else if (sortBy === 'timeSpent') sortField = 'performance.timeSpentMinutes'

    const sort = {}; sort[sortField] = -1

    const topStudents = await Student.find(query)
      .sort(sort)
      .limit(parseInt(limit))
      .populate('schoolId', 'name board')
      .select('name class schoolId performance rollNumber gender')

    const rankedStudents = topStudents.map((student, index) => ({ ...student.toObject(), rank: index + 1, badges: getStudentBadges(student, index + 1), score: student.performance[sortBy] || student.performance.xpPoints }))

    res.json({ leaderboard: rankedStudents, total: rankedStudents.length, period, sortBy, filters: { schoolId, className } })
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Get student rank
router.get('/students/:id/rank', protect, async (req, res) => {
  try {
    const { schoolId = '', class: className = '', sortBy = 'xpPoints' } = req.query
    let query = {}
    if (schoolId) query.schoolId = schoolId
    if (className) query.class = className

    const student = await Student.findById(req.params.id)
    if (!student) return res.status(404).json({ message: 'Student not found' })

    let sortField = 'performance.xpPoints'
    if (sortBy === 'accuracy') sortField = 'performance.accuracyPercentage'
    else if (sortBy === 'lessons') sortField = 'performance.lessonsCompleted'
    else if (sortBy === 'timeSpent') sortField = 'performance.timeSpentMinutes'

    const rank = await Student.countDocuments({ ...query, [sortField]: { $gt: student.performance[sortBy] || student.performance.xpPoints } })
    const totalStudents = await Student.countDocuments(query)
    const percentile = totalStudents > 0 ? Math.round(((totalStudents - rank) / totalStudents) * 100) : 0

    res.json({ student: { id: student._id, name: student.name, class: student.class, school: student.schoolId }, rank: rank + 1, totalStudents, percentile, score: student.performance[sortBy] || student.performance.xpPoints, sortBy })
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Get class leaderboard
router.get('/classes/:className', protect, async (req, res) => {
  try {
    const { schoolId = '', sortBy = 'xpPoints', limit = 20 } = req.query
    let query = { class: req.params.className }
    if (schoolId) query.schoolId = schoolId

    let sortField = 'performance.xpPoints'
    if (sortBy === 'accuracy') sortField = 'performance.accuracyPercentage'
    else if (sortBy === 'lessons') sortField = 'performance.lessonsCompleted'
    else if (sortBy === 'timeSpent') sortField = 'performance.timeSpentMinutes'

    const sort = {}; sort[sortField] = -1

    const classLeaderboard = await Student.find(query)
      .sort(sort)
      .limit(parseInt(limit))
      .populate('schoolId', 'name board')
      .select('name rollNumber gender performance')

    const rankedStudents = classLeaderboard.map((student, index) => ({ ...student.toObject(), rank: index + 1, badges: getStudentBadges(student, index + 1), score: student.performance[sortBy] || student.performance.xpPoints }))

    res.json({ className: req.params.className, leaderboard: rankedStudents, sortBy, filters: { schoolId } })
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Get school leaderboard
router.get('/schools', protect, async (req, res) => {
  try {
    const { limit = 10, sortBy = 'averageAccuracy', minStudents = 0 } = req.query

    let sortField = 'averageAccuracy'
    if (sortBy === 'totalStudents') sortField = 'totalStudents'
    else if (sortBy === 'totalLessons') sortField = 'totalLessons'
    else if (sortBy === 'activeStudents') sortField = 'activeStudents'

    const sort = {}; sort[sortField] = -1

    const schoolLeaderboard = await School.aggregate([
      { $match: { totalStudents: { $gte: parseInt(minStudents) } } },
      { $lookup: { from: 'students', localField: '_id', foreignField: 'schoolId', as: 'students' } },
      { $addFields: { averageAccuracy: { $avg: '$students.performance.accuracyPercentage' }, totalLessons: { $sum: '$students.performance.lessonsCompleted' }, activeStudents: { $size: { $filter: { input: '$students', cond: { $gt: ['$$this.performance.lessonsCompleted', 0] } } } }, averageXP: { $avg: '$students.performance.xpPoints' } } },
      { $project: { name: 1, board: 1, totalStudents: 1, averageAccuracy: 1, totalLessons: 1, activeStudents: 1, averageXP: 1, status: 1, createdAt: 1, 'adminContact.email': 1 } },
      { $sort: sort },
      { $limit: parseInt(limit) }
    ])

    const rankedSchools = schoolLeaderboard.map((school, index) => ({ ...school, rank: index + 1, badges: getSchoolBadges(school, index + 1), improvement: getRandomImprovement() }))

    res.json({ leaderboard: rankedSchools, total: rankedSchools.length, sortBy, filters: { minStudents } })
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Get subject-wise leaderboard
router.get('/subjects/:subject', protect, async (req, res) => {
  try {
    const { schoolId = '', class: className = '', limit = 20 } = req.query
    const subject = req.params.subject.toLowerCase()
    const validSubjects = ['vocabulary', 'grammar', 'pronunciation', 'listening', 'speaking']

    if (!validSubjects.includes(subject)) {
      return res.status(400).json({ message: 'Invalid subject. Must be one of: vocabulary, grammar, pronunciation, listening, speaking' })
    }

    let query = {}
    if (schoolId) query.schoolId = schoolId
    if (className) query.class = className

    const sort = {}; sort[`performance.skillAreas.${subject}`] = -1

    const subjectLeaderboard = await Student.find(query)
      .sort(sort)
      .limit(parseInt(limit))
      .populate('schoolId', 'name board')
      .select(`name class rollNumber gender performance.skillAreas.${subject}`)

    const rankedStudents = subjectLeaderboard.map((student, index) => ({ ...student.toObject(), rank: index + 1, badges: getStudentBadges(student, index + 1), score: student.performance.skillAreas[subject] }))

    res.json({ subject: subject.charAt(0).toUpperCase() + subject.slice(1), leaderboard: rankedStudents, filters: { schoolId, className } })
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Get achievements and milestones
router.get('/achievements', protect, async (req, res) => {
  try {
    const { schoolId = '', studentId = '' } = req.query
    let query = {}
    if (schoolId) query.schoolId = schoolId
    if (studentId) query._id = studentId

    const students = await Student.find(query)
      .populate('schoolId', 'name')
      .select('name class schoolId performance')

    const achievements = []

    students.forEach(student => {
      const performance = student.performance
      if (performance.xpPoints >= 1000) {
        achievements.push({ student: student.name, class: student.class, school: student.schoolId?.name, achievement: 'XP Master', description: 'Reached 1000+ XP points', level: 'gold', value: performance.xpPoints })
      } else if (performance.xpPoints >= 500) {
        achievements.push({ student: student.name, class: student.class, school: student.schoolId?.name, achievement: 'XP Expert', description: 'Reached 500+ XP points', level: 'silver', value: performance.xpPoints })
      }
      if (performance.accuracyPercentage >= 95) {
        achievements.push({ student: student.name, class: student.class, school: student.schoolId?.name, achievement: 'Perfect Accuracy', description: 'Achieved 95%+ accuracy', level: 'diamond', value: performance.accuracyPercentage })
      } else if (performance.accuracyPercentage >= 90) {
        achievements.push({ student: student.name, class: student.class, school: student.schoolId?.name, achievement: 'High Achiever', description: 'Achieved 90%+ accuracy', level: 'gold', value: performance.accuracyPercentage })
      }
      if (performance.lessonsCompleted >= 100) {
        achievements.push({ student: student.name, class: student.class, school: student.schoolId?.name, achievement: 'Lesson Master', description: 'Completed 100+ lessons', level: 'gold', value: performance.lessonsCompleted })
      } else if (performance.lessonsCompleted >= 50) {
        achievements.push({ student: student.name, class: student.class, school: student.schoolId?.name, achievement: 'Dedicated Learner', description: 'Completed 50+ lessons', level: 'silver', value: performance.lessonsCompleted })
      }
      if (performance.timeSpentMinutes >= 10000) {
        achievements.push({ student: student.name, class: student.class, school: student.schoolId?.name, achievement: 'Time Master', description: 'Spent 10,000+ minutes learning', level: 'gold', value: performance.timeSpentMinutes })
      }
    })

    achievements.sort((a, b) => {
      const levelOrder = { diamond: 4, gold: 3, silver: 2, bronze: 1 }
      if (levelOrder[a.level] !== levelOrder[b.level]) {
        return levelOrder[b.level] - levelOrder[a.level]
      }
      return b.value - a.value
    })

    res.json({ achievements, total: achievements.length, filters: { schoolId, studentId } })
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Helper functions
function getStudentBadges(student, rank) {
  const badges = []
  const performance = student.performance
  if (rank === 1) badges.push('🏆')
  if (rank <= 3) badges.push('⭐')
  if (rank <= 5) badges.push('🔥')
  if (performance.accuracyPercentage >= 95) badges.push('🎯')
  if (performance.xpPoints >= 1000) badges.push('⚡')
  if (performance.lessonsCompleted >= 100) badges.push('📚')
  if (performance.timeSpentMinutes >= 10000) badges.push('⏰')
  return badges
}

function getSchoolBadges(school, rank) {
  const badges = []
  if (rank === 1) badges.push('🏆')
  if (rank <= 3) badges.push('⭐')
  if (rank <= 5) badges.push('🔥')
  if (school.averageAccuracy > 90) badges.push('🎯')
  if (school.activeStudents / school.totalStudents > 0.8) badges.push('⚡')
  if (school.totalLessons > 1000) badges.push('📚')
  return badges
}

function getRandomImprovement() { const improvements = ['+5%', '+8%', '+12%', '+15%', '+3%', '+7%', '+10%']; return improvements[Math.floor(Math.random() * improvements.length)] }

export default router
