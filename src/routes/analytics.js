import express from 'express'
import School from '../models/School.js'
import Student from '../models/Student.js'
import { protect } from '../middleware/auth.js'

const router = express.Router()

// Get dashboard overview statistics
router.get('/dashboard', protect, async (req, res) => {
  try {
    const { schoolId } = req.query
    let schoolQuery = {}
    let studentQuery = {}
    
    if (schoolId) {
      schoolQuery._id = schoolId
      studentQuery.schoolId = schoolId
    }
    
    const schoolStats = await School.aggregate([
      { $match: schoolQuery },
      { $group: { _id: null, totalSchools: { $sum: 1 }, activeSchools: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } }, inactiveSchools: { $sum: { $cond: [{ $eq: ['$status', 'inactive'] }, 1, 0] } }, totalStudents: { $sum: '$totalStudents' }, averageStudents: { $avg: '$totalStudents' } } }
    ])

    const studentStats = await Student.aggregate([
      { $match: studentQuery },
      { $group: { _id: null, totalStudents: { $sum: 1 }, averageAccuracy: { $avg: '$performance.accuracyPercentage' }, totalLessons: { $sum: '$performance.lessonsCompleted' }, totalXP: { $sum: '$performance.xpPoints' }, averageTimeSpent: { $avg: '$performance.timeSpentMinutes' } } }
    ])

    const boardDistribution = await School.aggregate([
      { $match: schoolQuery },
      { $group: { _id: '$board', count: { $sum: 1 }, totalStudents: { $sum: '$totalStudents' } } },
      { $sort: { count: -1 } }
    ])

    const classDistribution = await Student.aggregate([
      { $match: studentQuery },
      { $group: { _id: '$class', count: { $sum: 1 }, averageAccuracy: { $avg: '$performance.accuracyPercentage' } } },
      { $sort: { _id: 1 } }
    ])

    res.json({
      overview: {
        schools: schoolStats[0] || { totalSchools: 0, activeSchools: 0, inactiveSchools: 0, totalStudents: 0, averageStudents: 0 },
        students: studentStats[0] || { totalStudents: 0, averageAccuracy: 0, totalLessons: 0, totalXP: 0, averageTimeSpent: 0 }
      },
      boardDistribution,
      classDistribution
    })
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Get performance distribution
router.get('/performance/distribution', protect, async (req, res) => {
  try {
    const { schoolId, class: className } = req.query
    let query = {}
    if (schoolId) query.schoolId = schoolId
    if (className) query.class = className

    const performanceDistribution = await Student.aggregate([
      { $match: query },
      { $group: { _id: { $switch: { branches: [ { case: { $gte: ['$performance.accuracyPercentage', 90] }, then: 'excellent' }, { case: { $gte: ['$performance.accuracyPercentage', 75] }, then: 'good' }, { case: { $gte: ['$performance.accuracyPercentage', 60] }, then: 'average' }, { case: { $gte: ['$performance.accuracyPercentage', 0] }, then: 'needsImprovement' } ], default: 'needsImprovement' } }, count: { $sum: 1 }, averageAccuracy: { $avg: '$performance.accuracyPercentage' } } },
      { $sort: { _id: 1 } }
    ])

    const totalStudents = performanceDistribution.reduce((sum, item) => sum + item.count, 0)
    const distributionWithPercentages = performanceDistribution.map(item => ({ ...item, percentage: totalStudents > 0 ? Math.round((item.count / totalStudents) * 100) : 0 }))

    res.json({
      distribution: distributionWithPercentages,
      totalStudents,
      summary: {
        excellent: distributionWithPercentages.find(d => d._id === 'excellent')?.count || 0,
        good: distributionWithPercentages.find(d => d._id === 'good')?.count || 0,
        average: distributionWithPercentages.find(d => d._id === 'average')?.count || 0,
        needsImprovement: distributionWithPercentages.find(d => d._id === 'needsImprovement')?.count || 0
      }
    })
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Get skill analytics
router.get('/performance/skills', protect, async (req, res) => {
  try {
    const { schoolId, class: className } = req.query
    let query = {}
    if (schoolId) query.schoolId = schoolId
    if (className) query.class = className

    const skillAnalytics = await Student.aggregate([
      { $match: query },
      { $group: { _id: null, vocabulary: { $avg: '$performance.skillAreas.vocabulary' }, grammar: { $avg: '$performance.skillAreas.grammar' }, pronunciation: { $avg: '$performance.skillAreas.pronunciation' }, listening: { $avg: '$performance.skillAreas.listening' }, speaking: { $avg: '$performance.skillAreas.speaking' } } }
    ])

    if (skillAnalytics.length === 0) return res.json({ skills: [], overall: 0 })

    const skills = [
      { skill: 'Vocabulary', average: Math.round(skillAnalytics[0].vocabulary || 0) },
      { skill: 'Grammar', average: Math.round(skillAnalytics[0].grammar || 0) },
      { skill: 'Pronunciation', average: Math.round(skillAnalytics[0].pronunciation || 0) },
      { skill: 'Listening', average: Math.round(skillAnalytics[0].listening || 0) },
      { skill: 'Speaking', average: Math.round(skillAnalytics[0].speaking || 0) }
    ]

    const overall = Math.round(skills.reduce((sum, s) => sum + s.average, 0) / skills.length)
    res.json({ skills, overall })
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Get engagement trends
router.get('/engagement/trends', protect, async (req, res) => {
  try {
    const { schoolId, period = 'monthly' } = req.query
    let query = {}
    if (schoolId) query.schoolId = schoolId

    let groupBy = {}
    if (period === 'monthly') groupBy = { $dateToString: { format: '%Y-%m', date: '$enrollmentDate' } }
    else if (period === 'weekly') groupBy = { $dateToString: { format: '%Y-W%U', date: '$enrollmentDate' } }
    else groupBy = { $dateToString: { format: '%Y', date: '$enrollmentDate' } }

    const engagementTrends = await Student.aggregate([
      { $match: query },
      { $group: { _id: groupBy, count: { $sum: 1 }, avgTime: { $avg: '$performance.timeSpentMinutes' }, avgLessons: { $avg: '$performance.lessonsCompleted' }, avgAccuracy: { $avg: '$performance.accuracyPercentage' } } },
      { $sort: { _id: 1 } },
      { $limit: 12 }
    ])

    res.json({ trends: engagementTrends.map(t => ({ period: t._id, newStudents: t.count, avgTime: Math.round(t.avgTime || 0), avgLessons: Math.round(t.avgLessons || 0), avgAccuracy: Math.round(t.avgAccuracy || 0) })) })
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Get top performing schools
router.get('/schools/top-performing', protect, async (req, res) => {
  try {
    const { limit = 10, minStudents = 0 } = req.query
    const topSchools = await School.aggregate([
      { $match: { totalStudents: { $gte: parseInt(minStudents) } } },
      { $lookup: { from: 'students', localField: '_id', foreignField: 'schoolId', as: 'students' } },
      { $addFields: { averageAccuracy: { $avg: '$students.performance.accuracyPercentage' }, totalLessons: { $sum: '$students.performance.lessonsCompleted' }, activeStudents: { $size: { $filter: { input: '$students', cond: { $gt: ['$$this.performance.lessonsCompleted', 0] } } } } } },
      { $project: { name: 1, board: 1, totalStudents: 1, averageAccuracy: 1, totalLessons: 1, activeStudents: 1, status: 1, createdAt: 1, 'adminContact.email': 1 } },
      { $sort: { averageAccuracy: -1 } },
      { $limit: parseInt(limit) }
    ])

    const rankedSchools = topSchools.map((school, index) => ({ ...school, rank: index + 1, badges: getBadges(school, index + 1), improvement: getRandomImprovement() }))
    res.json(rankedSchools)
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

// Get comparative analytics
router.get('/comparative', protect, async (req, res) => {
  try {
    const { schoolId, compareWith = 'all' } = req.query
    if (!schoolId) return res.status(400).json({ message: 'School ID is required for comparative analysis' })

    const currentSchool = await School.findById(schoolId)
    if (!currentSchool) return res.status(404).json({ message: 'School not found' })

    const currentSchoolStats = await Student.aggregate([
      { $match: { schoolId } },
      { $group: { _id: null, totalStudents: { $sum: 1 }, averageAccuracy: { $avg: '$performance.accuracyPercentage' }, totalLessons: { $sum: '$performance.lessonsCompleted' }, averageTimeSpent: { $avg: '$performance.timeSpentMinutes' } } }
    ])

    let comparisonQuery = {}
    if (compareWith === 'same-board') comparisonQuery.board = currentSchool.board
    else if (compareWith === 'same-size') comparisonQuery.totalStudents = getSizeRange(currentSchool.totalStudents)

    const comparisonStats = await School.aggregate([
      { $match: { ...comparisonQuery, _id: { $ne: schoolId } } },
      { $lookup: { from: 'students', localField: '_id', foreignField: 'schoolId', as: 'students' } },
      { $group: { _id: null, totalSchools: { $sum: 1 }, averageAccuracy: { $avg: '$students.performance.accuracyPercentage' }, averageLessons: { $avg: '$students.performance.lessonsCompleted' }, averageTimeSpent: { $avg: '$students.performance.timeSpentMinutes' } } }
    ])

    const current = currentSchoolStats[0] || { totalStudents: 0, averageAccuracy: 0, totalLessons: 0, averageTimeSpent: 0 }
    const comparison = comparisonStats[0] || { totalSchools: 0, averageAccuracy: 0, averageLessons: 0, averageTimeSpent: 0 }

    const performanceComparison = {
      accuracy: {
        current: Math.round(current.averageAccuracy || 0),
        comparison: Math.round(comparison.averageAccuracy || 0),
        difference: Math.round((current.averageAccuracy || 0) - (comparison.averageAccuracy || 0)),
        percentage: comparison.averageAccuracy > 0 ? Math.round(((current.averageAccuracy - comparison.averageAccuracy) / comparison.averageAccuracy) * 100) : 0
      },
      lessons: {
        current: Math.round(current.totalLessons || 0),
        comparison: Math.round(comparison.averageLessons || 0),
        difference: Math.round((current.totalLessons || 0) - (comparison.averageLessons || 0))
      },
      timeSpent: {
        current: Math.round(current.averageTimeSpent || 0),
        comparison: Math.round(comparison.averageTimeSpent || 0),
        difference: Math.round((current.averageTimeSpent || 0) - (comparison.averageTimeSpent || 0))
      }
    }

    res.json({ currentSchool: currentSchool.name, comparisonGroup: compareWith, performanceComparison, summary: { isAboveAverage: performanceComparison.accuracy.difference > 0, rank: 'top', percentile: 85 } })
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message })
  }
})

function getBadges(school, rank) {
  const badges = []
  if (rank === 1) badges.push('🏆')
  if (rank <= 3) badges.push('⭐')
  if (school.averageAccuracy > 90) badges.push('🔥')
  if (school.activeStudents / school.totalStudents > 0.8) badges.push('⚡')
  return badges
}

function getRandomImprovement() {
  const improvements = ['+5%', '+8%', '+12%', '+15%', '+3%', '+7%']
  return improvements[Math.floor(Math.random() * improvements.length)]
}

function getSizeRange(studentCount) {
  if (studentCount < 100) return { $lt: 100 }
  if (studentCount < 500) return { $gte: 100, $lt: 500 }
  if (studentCount < 1000) return { $gte: 500, $lt: 1000 }
  return { $gte: 1000 }
}

export default router
