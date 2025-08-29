# SpeakGenie School Admin Panel - Backend

A comprehensive School ERP system backend with role-based access control, built with Node.js, Express, and MongoDB Atlas.

## 🚀 Features

### Role-Based Access Control (RBAC)
- **Super Admin**: Full CRUD access to all schools, students, and system-wide operations
- **School Admin**: Read-only access to their own school data (monitor, view stats, progress)
- **Normal Admin**: Limited access based on their role

### Core Modules
- **User Management**: Authentication, authorization, role management
- **School Management**: School CRUD, statistics, search
- **Student Management**: Student CRUD, performance tracking, bulk operations
- **Analytics**: Dashboard stats, performance distribution, trends
- **Leaderboard**: Rankings, competitions, achievements
- **Settings**: User preferences, system configuration
- **Export**: CSV/PDF generation, data backup

## 🛠️ Prerequisites

- Node.js >= 18.0.0
- MongoDB Atlas account
- Network access to MongoDB Atlas (IP whitelist or 0.0.0.0/0 for development)

## 📦 Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd School-Admin-Panel/backend
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Environment Configuration**
   Create a `.env` file in the backend directory:
   ```env
   # Server Configuration
   PORT=5000
   NODE_ENV=development
   
   # MongoDB Configuration - Production Database
   MONGODB_URI=mongodb+srv://sourcecube:sourcecube%40123@cluster0.0pa3x.mongodb.net/node-speak-genie
   
   # JWT Configuration
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   JWT_EXPIRES_IN=7d
   JWT_REFRESH_SECRET=your-refresh-secret-key
   JWT_REFRESH_EXPIRES_IN=30d
   
   # CORS Configuration
   CORS_ORIGIN=http://localhost:5173
   
   # Role-Based Access Control
   SUPER_ADMIN_EMAIL=superadmin@speakgenie.com
   ENABLE_CRUD_FOR_SCHOOL_ADMIN=false
   ```

4. **Create Super Admin**
   ```bash
   npm run create-super-admin
   ```
   This creates the first super admin user with:
   - Email: `superadmin@speakgenie.com`
   - Password: `SuperAdmin123!`
   - Role: `super_admin`

   **⚠️ IMPORTANT**: Change the password immediately after first login!

## 🚀 Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

The server will start on `http://localhost:5000`

## 🔐 Authentication & Authorization

### User Roles

#### Super Admin
- Full access to all schools and students
- Can perform all CRUD operations
- Can view system-wide analytics and reports
- Can manage other users

#### School Admin
- Read-only access to their own school data
- Can view students, classes, and performance metrics
- Cannot create, update, or delete data
- Restricted to their assigned school

### API Endpoints

#### Public Endpoints
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User authentication
- `POST /api/auth/onboarding` - Complete school setup

#### Protected Endpoints (Require Authentication)
- `GET /api/schools/*` - School data (filtered by role)
- `GET /api/students/*` - Student data (filtered by role)
- `GET /api/analytics/*` - Analytics and reports
- `GET /api/leaderboard/*` - Leaderboard data

#### Super Admin Only Endpoints
- `POST /api/schools` - Create school
- `PUT /api/schools/:id` - Update school
- `DELETE /api/schools/:id` - Delete school
- `POST /api/students` - Create student
- `PUT /api/students/:id` - Update student
- `DELETE /api/students/:id` - Delete student

## 🗄️ Database Schema

### Collections

#### users
- `name`, `email`, `password`, `role`, `schoolId`
- `isActive`, `lastLogin`, `createdAt`, `updatedAt`

#### schools
- `name`, `board`, `address`, `website`, `description`
- `adminContact`, `totalStudents`, `status`
- `createdAt`, `updatedAt`

#### students
- `name`, `rollNumber`, `class`, `schoolId`
- `profile`: `{ age, gender }`
- `contactNumber`, `parentName`, `parentContact`, `address`
- `performance`: `{ accuracyPercentage, lessonsCompleted, assessments }`
- `enrollmentDate`, `createdAt`, `updatedAt`

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Password Hashing**: Bcrypt with configurable salt rounds
- **Role-Based Access Control**: Granular permissions based on user role
- **Input Validation**: Express-validator for request validation
- **Rate Limiting**: Protection against brute force attacks
- **CORS Protection**: Configurable cross-origin resource sharing
- **Helmet**: Security headers for Express

## 📊 API Response Format

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation successful"
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "message": "Error description",
    "code": "ERROR_CODE",
    "details": { ... }
  }
}
```

### Pagination Response
```json
{
  "data": [...],
  "pagination": {
    "currentPage": 1,
    "totalPages": 5,
    "total": 100,
    "limit": 20
  }
}
```

## 🧪 Testing

```bash
# Run tests
npm test

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test -- --testPathPattern=auth.test.js
```

## 📝 Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Server port | 5000 | No |
| `NODE_ENV` | Environment mode | development | No |
| `MONGODB_URI` | MongoDB connection string | - | Yes |
| `JWT_SECRET` | JWT signing secret | - | Yes |
| `JWT_EXPIRES_IN` | JWT expiration time | 7d | No |
| `SUPER_ADMIN_EMAIL` | Super admin email | superadmin@speakgenie.com | No |
| `ENABLE_CRUD_FOR_SCHOOL_ADMIN` | Allow school admins CRUD | false | No |

## 🚀 Deployment

### Production Checklist
- [ ] Change all default passwords
- [ ] Set strong JWT secrets
- [ ] Configure proper CORS origins
- [ ] Set up MongoDB Atlas IP whitelist
- [ ] Enable rate limiting
- [ ] Set up logging and monitoring
- [ ] Configure SSL/TLS
- [ ] Set up backup and recovery

### Docker Deployment
```bash
# Build image
docker build -t speakgenie-admin-backend .

# Run container
docker run -p 5000:5000 --env-file .env speakgenie-admin-backend
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the documentation

## 🔄 Changelog

### v1.0.0
- Initial release with role-based access control
- Complete School ERP functionality
- MongoDB Atlas integration
- JWT authentication system
- Comprehensive API endpoints
