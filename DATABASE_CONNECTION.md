# MongoDB Database Connection Flow

## Overview
This document describes the database connection architecture for the locationAPI application using NestJS, MongoDB, and Mongoose.

## Database Connection Architecture

### 1. Environment Configuration (.env)
```
PORT=3400
MONGO_URI=mongodb+srv://<db_username>:29dvZOQ887rYKCe6@hangautdb.wotkjes.mongodb.net/?appName=HangautDB
JWT_SECRET=your-secret-key
NODE_ENV=development
```

### 2. Configuration Validation (src/config/validation.ts)
- Validates environment variables using Joi schema
- Ensures MONGO_URI is required
- Provides default values for PORT and JWT_SECRET
- Validates NODE_ENV values

### 3. Database Module (src/database/database.module.ts)
The Database Module handles:
- ConfigModule initialization with validation
- MongooseModule async configuration
- Reading MONGO_URI from environment variables
- Establishing connection to MongoDB

**Key Features:**
- Global configuration scope (isGlobal: true)
- Async factory pattern for dynamic configuration
- Connection pooling with MongoDB options
- Dependency injection of ConfigService

### 4. User Schema (src/modules/users/schemas/user.schema.ts)
Mongoose schema definition with:
- Automatic timestamps (createdAt, updatedAt)
- Email with unique constraint
- Required fields: firstName, lastName, password, country, state, city, bio
- Optional fields: address
- Automatic document serialization

### 5. Users Service (src/modules/users/users.service.ts)
Service layer providing CRUD operations:
- `create()` - Create new user in database
- `findByEmail()` - Find user by email
- `findById()` - Find user by MongoDB ID
- `findAll()` - Retrieve all users
- `update()` - Update user data
- `delete()` - Delete user from database

Uses Mongoose Model for database operations with proper error handling.

### 6. Users Module (src/modules/users/users.module.ts)
- Registers User schema with Mongoose
- Exports UsersService for dependency injection
- Uses forFeature() to define feature-specific schemas

### 7. Auth Service Integration
The Auth Service uses Users Service for:
- User registration with password hashing
- Email existence validation
- Login authentication with password verification
- JWT token generation

### 8. Application Module (src/app.module.ts)
Root module orchestrating:
1. ConfigModule initialization (global scope)
2. DatabaseModule (MongoDB connection)
3. AuthModule (authentication layer)

## Connection Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Startup                       │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
        ┌──────────────────────────────────────┐
        │     Load .env Configuration          │
        │   - MONGO_URI                        │
        │   - JWT_SECRET                       │
        │   - PORT                             │
        └──────────────┬───────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────────────┐
        │   Validate Environment Variables     │
        │   (Joi Schema)                       │
        └──────────────┬───────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────────────┐
        │   DatabaseModule Initialization      │
        │   - ConfigModule (global)            │
        │   - MongooseModule (async factory)   │
        └──────────────┬───────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────────────┐
        │   Mongoose Connection to MongoDB     │
        │   - Build connection URI             │
        │   - Create connection pool           │
        │   - Connect to Hangaut DB            │
        └──────────────┬───────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────────────┐
        │   Register Feature Modules           │
        │   - UsersModule (User schema)        │
        │   - AuthModule (Auth logic)          │
        └──────────────┬───────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────────────┐
        │   Server Running on Port 3400        │
        │   Ready to Accept Requests           │
        └──────────────────────────────────────┘
```

## Request Flow Example: User Registration

```
POST /auth/register
    ▼
AuthController.register()
    ▼
AuthService.register()
    ├─ Check if user exists → UsersService.findByEmail()
    │   ├─ Query MongoDB: db.users.findOne({ email })
    │   └─ Return user or null
    │
    ├─ Hash password with bcrypt
    │
    ├─ Create new user → UsersService.create()
    │   ├─ Save to MongoDB: db.users.insertOne()
    │   └─ Return created user with _id
    │
    ├─ Generate JWT token
    │
    └─ Return token + user data (password excluded)
```

## Database Operations

### Create User
```typescript
const user = await usersService.create({
  email: 'user@example.com',
  firstName: 'John',
  lastName: 'Doe',
  password: 'hashedPassword',
  country: 'Nigeria',
  state: 'Lagos',
  city: 'Lekki',
  bio: 'User bio'
});
// MongoDB: inserted document with auto-generated _id and timestamps
```

### Find User
```typescript
const user = await usersService.findByEmail('user@example.com');
// MongoDB: db.users.findOne({ email: 'user@example.com' })
```

### Update User
```typescript
const updated = await usersService.update(userId, {
  firstName: 'Jane'
});
// MongoDB: db.users.findByIdAndUpdate(userId, { firstName: 'Jane' })
```

### Delete User
```typescript
await usersService.delete(userId);
// MongoDB: db.users.findByIdAndDelete(userId)
```

## Features

### ✅ Async Configuration
- ConfigService injected asynchronously
- Lazy loading of configuration
- Dependency resolution at runtime

### ✅ Mongoose Integration
- Automatic schema creation
- Document validation
- Timestamp management
- MongoDB-native ObjectId support

### ✅ Error Handling
- Duplicate email validation
- Invalid credentials handling
- Connection error recovery

### ✅ Security
- Password hashing with bcrypt
- JWT token authentication
- Environment variable protection

### ✅ TypeScript Support
- Type-safe database operations
- Interface definitions for User
- Mongoose Document types

## Next Steps

1. **Database Indexing**
   - Add index on email field for faster queries
   - Consider indexing frequently filtered fields

2. **Connection Pooling**
   - Configure mongoose connection pool size
   - Implement connection retry logic

3. **Error Handling**
   - Add connection error callbacks
   - Implement reconnection strategies

4. **Logging**
   - Add Winston/Pino logging
   - Log database operations for debugging

5. **Testing**
   - Write integration tests with test database
   - Use MongoDB Memory Server for testing
