// Note: No direct model imports required here; this middleware relies on req.user populated by auth middleware

// Middleware to check if user is super admin
export const requireSuperAdmin = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' })
    }

    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ 
        message: 'Access denied. Super admin privileges required.',
        requiredRole: 'super_admin',
        currentRole: req.user.role
      })
    }

    next()
  } catch (error) {
    res.status(500).json({ message: 'Role verification failed', error: error.message })
  }
}

// Middleware to check if user can access school data
export const canAccessSchool = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' })
    }

    const schoolId = req.params.schoolId || req.body.schoolId || req.query.schoolId

    // Super admin can access all schools
    if (req.user.role === 'super_admin') {
      return next()
    }

    // School admin can only access their own school
    if (req.user.role === 'school_admin') {
      if (!req.user.schoolId) {
        return res.status(403).json({ 
          message: 'School admin not associated with any school',
          currentRole: req.user.role
        })
      }

      if (schoolId && schoolId !== req.user.schoolId.toString()) {
        return res.status(403).json({ 
          message: 'Access denied. You can only access your own school data.',
          currentRole: req.user.role,
          yourSchoolId: req.user.schoolId,
          requestedSchoolId: schoolId
        })
      }

      return next()
    }

    // Default: deny access
    return res.status(403).json({ 
      message: 'Access denied. Insufficient privileges.',
      currentRole: req.user.role
    })

  } catch (error) {
    res.status(500).json({ message: 'Access control failed', error: error.message })
  }
}

// Middleware to check if user can perform CRUD operations
export const canPerformCRUD = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' })
    }

    // Only super admin can perform CRUD operations
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({ 
        message: 'Access denied. CRUD operations are restricted to super admins only.',
        requiredRole: 'super_admin',
        currentRole: req.user.role,
        operation: req.method
      })
    }

    next()
  } catch (error) {
    res.status(500).json({ message: 'CRUD permission check failed', error: error.message })
  }
}

// Middleware to check if user can view data (read-only access)
export const canViewData = async (req, res, next) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' })
    }

    // Both super admin and school admin can view data
    if (['super_admin', 'school_admin'].includes(req.user.role)) {
      return next()
    }

    return res.status(403).json({ 
      message: 'Access denied. Insufficient privileges to view data.',
      currentRole: req.user.role
    })

  } catch (error) {
    res.status(500).json({ message: 'View permission check failed', error: error.message })
  }
}
