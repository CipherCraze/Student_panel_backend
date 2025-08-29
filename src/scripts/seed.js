import mongoose from 'mongoose'
import dotenv from 'dotenv'
import User from '../models/User.js'
import School from '../models/School.js'
import Student from '../models/Student.js'

// Load environment variables
dotenv.config()

const connectDB = async () => {
  try {
    const mongoURI = process.env.MONGODB_URI || 'mongodb://localhost:27017/speakgenie_admin'
    await mongoose.connect(mongoURI)
    console.log('📦 MongoDB Connected for seeding')
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message)
    process.exit(1)
  }
}

const seedData = async () => {
  try {
    // Clear existing data
    await User.deleteMany({})
    await School.deleteMany({})
    await Student.deleteMany({})
    console.log('🗑️  Cleared existing data')

    // Create schools
    const schools = await School.create([
      {
        name: 'Greenwood Elementary',
        board: 'CBSE',
        adminContact: {
          name: 'Sarah Johnson',
          email: 'sarah@greenwood.edu',
          phone: '+15550123'
        },
        status: 'active',
        address: {
          street: '123 Greenwood Ave',
          city: 'Mumbai',
          state: 'Maharashtra',
          country: 'India',
          postalCode: '400001'
        }
      },
      {
        name: 'Riverside High School',
        board: 'ICSE',
        adminContact: {
          name: 'Michael Chen',
          email: 'michael@riverside.edu',
          phone: '+15550124'
        },
        status: 'active',
        address: {
          street: '456 Riverside Blvd',
          city: 'Delhi',
          state: 'Delhi',
          country: 'India',
          postalCode: '110001'
        }
      },
      {
        name: 'Sunnydale Academy',
        board: 'State Board',
        adminContact: {
          name: 'Emily Davis',
          email: 'emily@sunnydale.edu',
          phone: '+15550125'
        },
        status: 'inactive',
        address: {
          street: '789 Sunnydale St',
          city: 'Bangalore',
          state: 'Karnataka',
          country: 'India',
          postalCode: '560001'
        }
      }
    ])
    console.log('🏫 Created schools')

    // Create users
    const users = await User.create([
      {
        name: 'Super Admin',
        email: 'super@admin.com',
        password: 'password',
        role: 'super_admin'
      },
      {
        name: 'School Admin',
        email: 'school@admin.com',
        password: 'password',
        role: 'school_admin',
        schoolId: schools[0]._id
      }
    ])
    console.log('👥 Created users')

    // Create students
    const students = await Student.create([
      {
        name: 'Ahan Kumar',
        class: 'Class 8',
        schoolId: schools[0]._id,
        performance: {
          accuracyPercentage: 96,
          lessonsCompleted: 68,
          timeSpentMinutes: 8700,
          xpPoints: 830,
          skillAreas: {
            vocabulary: 98,
            grammar: 96,
            pronunciation: 94,
            listening: 97,
            speaking: 95
          },
          streak: 15
        },
        profile: {
          age: 13,
          gender: 'male'
        }
      },
      {
        name: 'Hvff',
        class: 'Class 7',
        schoolId: schools[0]._id,
        performance: {
          accuracyPercentage: 94,
          lessonsCompleted: 45,
          timeSpentMinutes: 5880,
          xpPoints: 295,
          skillAreas: {
            vocabulary: 96,
            grammar: 94,
            pronunciation: 92,
            listening: 95,
            speaking: 93
          },
          streak: 12
        },
        profile: {
          age: 12,
          gender: 'female'
        }
      },
      {
        name: 'Flower Girl',
        class: 'Class 6',
        schoolId: schools[0]._id,
        performance: {
          accuracyPercentage: 93,
          lessonsCompleted: 38,
          timeSpentMinutes: 5100,
          xpPoints: 190,
          skillAreas: {
            vocabulary: 95,
            grammar: 93,
            pronunciation: 91,
            listening: 94,
            speaking: 92
          },
          streak: 8
        },
        profile: {
          age: 11,
          gender: 'female'
        }
      },
      {
        name: '12 June Child Test',
        class: 'Class 5',
        schoolId: schools[0]._id,
        performance: {
          accuracyPercentage: 92,
          lessonsCompleted: 32,
          timeSpentMinutes: 4680,
          xpPoints: 165,
          skillAreas: {
            vocabulary: 94,
            grammar: 92,
            pronunciation: 90,
            listening: 93,
            speaking: 91
          },
          streak: 6
        },
        profile: {
          age: 10,
          gender: 'male'
        }
      },
      {
        name: 'Hcdff',
        class: 'Class 4',
        schoolId: schools[0]._id,
        performance: {
          accuracyPercentage: 91,
          lessonsCompleted: 30,
          timeSpentMinutes: 4320,
          xpPoints: 160,
          skillAreas: {
            vocabulary: 93,
            grammar: 91,
            pronunciation: 89,
            listening: 92,
            speaking: 90
          },
          streak: 5
        },
        profile: {
          age: 9,
          gender: 'male'
        }
      }
    ])
    console.log('👨‍🎓 Created students')

    // Update school student counts
    for (const school of schools) {
      await school.updateStudentCount()
    }
    console.log('📊 Updated school student counts')

    console.log('✅ Database seeded successfully!')
    console.log('\n📋 Sample Data:')
    console.log(`🏫 Schools: ${schools.length}`)
    console.log(`👥 Users: ${users.length}`)
    console.log(`👨‍🎓 Students: ${students.length}`)
    console.log('\n🔑 Login Credentials:')
    console.log('Super Admin: super@admin.com / password')
    console.log('School Admin: school@admin.com / password')

  } catch (error) {
    console.error('❌ Seeding error:', error)
  } finally {
    await mongoose.connection.close()
    console.log('📦 Database connection closed')
    process.exit(0)
  }
}

// Run the seeding
connectDB().then(() => {
  seedData()
})
