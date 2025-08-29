import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import dotenv from 'dotenv'
import User from '../models/User.js'

// Load environment variables
dotenv.config()

const createSuperAdmin = async () => {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI)
    console.log('Connected to MongoDB Atlas')

    // Check if super admin already exists
    const existingSuperAdmin = await User.findOne({ role: 'super_admin' })
    if (existingSuperAdmin) {
      console.log('Super admin already exists:', existingSuperAdmin.email)
      process.exit(0)
    }

    // Create super admin user
    const superAdminData = {
      name: 'Super Administrator',
      email: process.env.SUPER_ADMIN_EMAIL || 'superadmin@speakgenie.com',
      password: 'SuperAdmin123!', // Change this in production
      role: 'super_admin',
      isActive: true
    }

    // Hash password
    const salt = await bcrypt.genSalt(12)
    superAdminData.password = await bcrypt.hash(superAdminData.password, salt)

    // Create user
    const superAdmin = new User(superAdminData)
    await superAdmin.save()

    console.log('✅ Super admin created successfully!')
    console.log('Email:', superAdminData.email)
    console.log('Password:', 'SuperAdmin123!' + ' (Change this immediately!)')
    console.log('Role:', superAdminData.role)

    process.exit(0)
  } catch (error) {
    console.error('❌ Error creating super admin:', error.message)
    process.exit(1)
  }
}

// Run the script
createSuperAdmin()
