import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User.model.js';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

const createAdmin = async () => {
  try {
    // Get admin credentials from environment variables
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const adminName = process.env.ADMIN_NAME || 'Admin User';
    const adminPhone = process.env.ADMIN_PHONE || '9999999999';

    if (!adminEmail || !adminPassword) {
      console.error('❌ Error: ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required!');
      console.error('Please set these in your .env file:');
      console.error('ADMIN_EMAIL=your_admin_email@example.com');
      console.error('ADMIN_PASSWORD=your_secure_password');
      process.exit(1);
    }

    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/beforesalary';
    await mongoose.connect(mongoUri);
    console.log('✅ MongoDB Connected');

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: adminEmail });
    
    if (existingAdmin) {
      console.log('\n⚠️  Admin user already exists!');
      console.log(`Email: ${adminEmail}`);
      console.log('========================================\n');
      await mongoose.disconnect();
      process.exit(0);
    }

    // Create admin user
    // Note: Don't hash password manually - the User model's pre-save hook will hash it
    const admin = await User.create({
      name: adminName,
      email: adminEmail,
      phone: adminPhone,
      password: adminPassword, // Pass plain password - will be hashed by pre-save hook
      role: 'admin',
      isVerified: {
        email: true,
        phone: true
      },
      isActive: true
    });

    console.log('\n✅ Admin user created successfully!');
    console.log(`Email: ${adminEmail}`);
    console.log('========================================');
    console.log('⚠️  Please change the password after first login!\n');
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error creating admin:', error);
    await mongoose.disconnect();
    process.exit(1);
  }
};

createAdmin();

