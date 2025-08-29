import mongoose from 'mongoose'

const collectionName = process.env.SCHOOL_ADMINS_COLLECTION_NAME || 'school_admins'

const schoolAdminSchema = new mongoose.Schema({
  name: { type: String },
  email: { type: String, unique: true, index: true },
  password: { type: String, required: true }, // bcrypt hash
  isDeleted: { type: Boolean, default: false },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date }
}, {
  timestamps: true,
  collection: collectionName
})

export default mongoose.model('SchoolAdmin', schoolAdminSchema)
