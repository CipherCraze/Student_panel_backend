import mongoose from 'mongoose'

const adminContactSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add admin contact name'],
    trim: true,
    maxlength: [100, 'Name cannot be more than 100 characters']
  },
  email: {
    type: String,
    required: [true, 'Please add admin contact email'],
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ]
  },
  phone: {
    type: String,
    required: [true, 'Please add admin contact phone'],
    match: [
      /^[\+]?[1-9][\d]{0,15}$/,
      'Please add a valid phone number'
    ]
  }
})

const schoolSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please add a school name'],
    unique: true,
    trim: true,
    maxlength: [200, 'School name cannot be more than 200 characters']
  },
  board: {
    type: String,
    required: [true, 'Please add a board'],
    enum: ['CBSE', 'ICSE', 'State Board', 'IB', 'Cambridge', 'Other'],
    default: 'CBSE'
  },
  adminContact: {
    type: adminContactSchema,
    required: [true, 'Please add admin contact information']
  },
  totalStudents: {
    type: Number,
    default: 0,
    min: [0, 'Total students cannot be negative']
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'pending'],
    default: 'active'
  },
  address: {
    street: String,
    city: String,
    state: String,
    country: String,
    postalCode: String
  },
  website: {
    type: String,
    match: [
      /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/,
      'Please add a valid website URL'
    ]
  },
  description: {
    type: String,
    maxlength: [1000, 'Description cannot be more than 1000 characters']
  },
  features: {
    hasAnalytics: { type: Boolean, default: true },
    hasExport: { type: Boolean, default: true },
    hasRealTime: { type: Boolean, default: true },
    customBranding: { type: Boolean, default: false }
  },
  settings: {
    timezone: { type: String, default: 'UTC' },
    language: { type: String, default: 'en' },
    notifications: {
      email: { type: Boolean, default: true },
      performance: { type: Boolean, default: true },
      newStudents: { type: Boolean, default: true }
    }
  }
}, {
  timestamps: true
})

// Index for better query performance
schoolSchema.index({ name: 1 })
schoolSchema.index({ board: 1 })
schoolSchema.index({ status: 1 })
schoolSchema.index({ 'adminContact.email': 1 })

// Virtual for school statistics
schoolSchema.virtual('stats').get(function() {
  return {
    totalStudents: this.totalStudents,
    activeStudents: 0, // Will be calculated from students collection
    averageAccuracy: 0, // Will be calculated from students collection
    totalLessons: 0 // Will be calculated from students collection
  }
})

// Method to update student count
schoolSchema.methods.updateStudentCount = async function() {
  const Student = mongoose.model('Student')
  const count = await Student.countDocuments({ schoolId: this._id })
  this.totalStudents = count
  return this.save()
}

// Method to get school performance
schoolSchema.methods.getPerformance = async function() {
  const Student = mongoose.model('Student')
  const students = await Student.find({ schoolId: this._id })
  
  if (students.length === 0) {
    return {
      totalStudents: 0,
      activeStudents: 0,
      averageAccuracy: 0,
      totalLessons: 0,
      averageTimeSpent: 0
    }
  }

  const totalStudents = students.length
  const activeStudents = students.filter(s => s.performance.lessonsCompleted > 0).length
  const averageAccuracy = students.reduce((sum, s) => sum + s.performance.accuracyPercentage, 0) / totalStudents
  const totalLessons = students.reduce((sum, s) => sum + s.performance.lessonsCompleted, 0)
  const averageTimeSpent = students.reduce((sum, s) => sum + s.performance.timeSpentMinutes, 0) / totalStudents

  return {
    totalStudents,
    activeStudents,
    averageAccuracy: Math.round(averageAccuracy * 100) / 100,
    totalLessons,
    averageTimeSpent: Math.round(averageTimeSpent)
  }
}

// Ensure virtual fields are serialized
schoolSchema.set('toJSON', {
  virtuals: true
})

export default mongoose.model('School', schoolSchema)
