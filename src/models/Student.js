import mongoose from 'mongoose'

const skillAreasSchema = new mongoose.Schema({
  vocabulary: {
    type: Number,
    min: [0, 'Vocabulary score cannot be negative'],
    max: [100, 'Vocabulary score cannot exceed 100'],
    default: 0
  },
  grammar: {
    type: Number,
    min: [0, 'Grammar score cannot be negative'],
    max: [100, 'Grammar score cannot exceed 100'],
    default: 0
  },
  pronunciation: {
    type: Number,
    min: [0, 'Pronunciation score cannot be negative'],
    max: [100, 'Pronunciation score cannot exceed 100'],
    default: 0
  },
  listening: {
    type: Number,
    min: [0, 'Listening score cannot be negative'],
    max: [100, 'Listening score cannot exceed 100'],
    default: 0
  },
  speaking: {
    type: Number,
    min: [0, 'Speaking score cannot be negative'],
    max: [100, 'Speaking score cannot exceed 100'],
    default: 0
  }
})

const assessmentsSchema = new mongoose.Schema({
  classTests: { type: Number, min: 0, max: 100, default: 0 },
  assignments: { type: Number, min: 0, max: 100, default: 0 },
  attendance: { type: Number, min: 0, max: 100, default: 0 },
  midTerm: { type: Number, min: 0, max: 100, default: 0 },
  finals: { type: Number, min: 0, max: 100, default: 0 },
  discipline: { type: String, enum: ['excellent', 'good', 'average', 'poor'], default: 'good' }
}, { _id: false })

const performanceSchema = new mongoose.Schema({
  accuracyPercentage: {
    type: Number,
    min: [0, 'Accuracy percentage cannot be negative'],
    max: [100, 'Accuracy percentage cannot exceed 100'],
    default: 0
  },
  lessonsCompleted: {
    type: Number,
    min: [0, 'Lessons completed cannot be negative'],
    default: 0
  },
  timeSpentMinutes: {
    type: Number,
    min: [0, 'Time spent cannot be negative'],
    default: 0
  },
  xpPoints: {
    type: Number,
    min: [0, 'XP points cannot be negative'],
    default: 0
  },
  skillAreas: {
    type: skillAreasSchema,
    default: () => ({})
  },
  assessments: {
    type: assessmentsSchema,
    default: () => ({})
  },
  lastActivity: {
    type: Date,
    default: Date.now
  },
  streak: {
    type: Number,
    min: [0, 'Streak cannot be negative'],
    default: 0
  },
  achievements: [{
    name: String,
    description: String,
    earnedAt: {
      type: Date,
      default: Date.now
    }
  }]
})

const studentSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a student name'],
    trim: true,
    maxlength: [100, 'Name cannot be more than 100 characters']
  },
  rollNumber: {
    type: String,
    trim: true,
  },
  class: {
    type: String,
    required: [true, 'Please add a class'],
    trim: true
  },
  schoolId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'School',
    required: [true, 'Please add a school ID']
  },
  enrollmentDate: {
    type: Date,
    default: Date.now
  },
  performance: {
    type: performanceSchema,
    default: () => ({})
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended'],
    default: 'active'
  },
  // Simple contact fields to align with current UI
  contactNumber: String,
  parentName: String,
  parentContact: String,
  address: String,
  profile: {
    age: {
      type: Number,
      min: [3, 'Age must be at least 3'],
      max: [18, 'Age must not exceed 18']
    },
    gender: {
      type: String,
      enum: ['male', 'female', 'other', 'prefer-not-to-say']
    },
    photo: String,
    bio: {
      type: String,
      maxlength: [500, 'Bio cannot be more than 500 characters']
    }
  },
  preferences: {
    language: {
      type: String,
      default: 'en'
    },
    difficulty: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'beginner'
    },
    notifications: {
      email: { type: Boolean, default: true },
      push: { type: Boolean, default: true },
      achievements: { type: Boolean, default: true }
    }
  },
  contact: {
    email: {
      type: String,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please add a valid email'
      ]
    },
    phone: String,
    parentName: String,
    parentEmail: {
      type: String,
      match: [
        /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
        'Please add a valid email'
      ]
    },
    parentPhone: String
  }
}, {
  timestamps: true
})

// Index for better query performance
studentSchema.index({ schoolId: 1 })
studentSchema.index({ class: 1 })
studentSchema.index({ name: 1 })
studentSchema.index({ rollNumber: 1 })
studentSchema.index({ 'performance.accuracyPercentage': -1 })
studentSchema.index({ 'performance.xpPoints': -1 })
studentSchema.index({ enrollmentDate: -1 })

// Virtual for student rank
studentSchema.virtual('rank').get(function() {
  // This will be calculated dynamically in queries
  return null
})

// Virtual for student level based on XP
studentSchema.virtual('level').get(function() {
  const xp = this.performance.xpPoints || 0
  return Math.floor(xp / 100) + 1
})

// Virtual for time spent in hours
studentSchema.virtual('timeSpentHours').get(function() {
  return Math.round((this.performance.timeSpentMinutes || 0) / 60 * 100) / 100
})

// Method to update performance
studentSchema.methods.updatePerformance = function(performanceData) {
  this.performance = { ...this.performance, ...performanceData }
  this.performance.lastActivity = Date.now()
  return this.save()
}

// Method to add achievement
studentSchema.methods.addAchievement = function(achievement) {
  this.performance.achievements.push(achievement)
  return this.save()
}

// Method to update streak
studentSchema.methods.updateStreak = function(increment = 1) {
  this.performance.streak = (this.performance.streak || 0) + increment
  return this.save()
}

// Method to reset streak
studentSchema.methods.resetStreak = function() {
  this.performance.streak = 0
  return this.save()
}

// Method to calculate overall performance score
studentSchema.methods.getOverallScore = function() {
  const skillScores = Object.values(this.performance.skillAreas || {})
  if (skillScores.length === 0) return 0
  
  return Math.round(skillScores.reduce((sum, score) => sum + score, 0) / skillScores.length)
}

// Static method to get top performers
studentSchema.statics.getTopPerformers = async function(limit = 10, schoolId = null) {
  const query = schoolId ? { schoolId } : {}
  
  return this.find(query)
    .sort({ 'performance.xpPoints': -1 })
    .limit(limit)
    .populate('schoolId', 'name board')
}

// Static method to get class leaderboard
studentSchema.statics.getClassLeaderboard = async function(classId, schoolId) {
  return this.find({ class: classId, schoolId })
    .sort({ 'performance.xpPoints': -1 })
    .populate('schoolId', 'name')
}

// Ensure virtual fields are serialized
studentSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    // Add calculated fields
    ret.level = doc.level
    ret.timeSpentHours = doc.timeSpentHours
    ret.overallScore = doc.getOverallScore()
    return ret
  }
})

export default mongoose.model('Student', studentSchema)
