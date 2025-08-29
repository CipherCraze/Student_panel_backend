import mongoose from 'mongoose'

const adminSchema = new mongoose.Schema({
  name: { type: String },
  email: { type: String, unique: true, index: true },
  password: { type: String, required: true }, // bcrypt hash stored in company DB
  isDeleted: { type: Boolean, default: false },
  resetPasswordToken: { type: String },
  resetPasswordExpires: { type: Date },
}, {
  timestamps: true,
  collection: 'admins'
})

export default mongoose.model('Admin', adminSchema)
