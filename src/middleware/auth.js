import jwt from 'jsonwebtoken'
import User from '../models/User.js'

const protect = async (req, res, next) => {
  let token

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Get token from header
      token = req.headers.authorization.split(' ')[1]

      // Verify token
      const decoded = jwt.verify(token, process.env.JWT_SECRET)

      // Get user from token
      req.user = await User.findById(decoded.id).select('-password')

      if (!req.user) {
        return res.status(401).json({
          success: false,
          error: 'User not found'
        })
      }

      next()
    } catch (error) {
      console.error('Token verification error:', error)
      return res.status(401).json({
        success: false,
        error: 'Not authorized, token failed'
      })
    }
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      error: 'Not authorized, no token'
    })
  }
}

// Middleware to check if user is super admin
const requireSuperAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'super_admin') {
    next()
  } else {
    return res.status(403).json({
      success: false,
      error: 'Access denied. Super admin privileges required.'
    })
  }
}

// Middleware to check if user is school admin
const requireSchoolAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'school_admin') {
    next()
  } else {
    return res.status(403).json({
      success: false,
      error: 'Access denied. School admin privileges required.'
    })
  }
}

// Middleware to check if user can access school data
const canAccessSchool = (req, res, next) => {
  const schoolId = req.params.schoolId || req.body.schoolId || req.query.schoolId
  
  if (req.user.role === 'super_admin') {
    // Super admin can access all schools
    next()
  } else if (req.user.role === 'school_admin' && req.user.schoolId === schoolId) {
    // School admin can only access their own school
    next()
  } else {
    return res.status(403).json({
      success: false,
      error: 'Access denied. You can only access your assigned school data.'
    })
  }
}

export { protect, requireSuperAdmin, requireSchoolAdmin, canAccessSchool }
