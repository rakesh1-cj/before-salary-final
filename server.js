import express from 'express';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

// Get directory paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables with explicit path
const envPath = path.join(__dirname, '.env');
const envExamplePath = path.join(__dirname, '.env.example');

// Check if .env file exists
if (!existsSync(envPath)) {
  console.warn('⚠️  .env file not found at:', envPath);
  if (existsSync(envExamplePath)) {
    console.warn('   Found .env.example file. Please copy it to .env and configure it.');
  } else {
    console.warn('   Please create a .env file in the Server directory with:');
    console.warn('   EMAIL_HOST=smtp.gmail.com');
    console.warn('   EMAIL_PORT=587');
    console.warn('   EMAIL_USER=your_email@gmail.com');
    console.warn('   EMAIL_PASS=your_app_password');
  }
} else {
  console.log('✅ Found .env file at:', envPath);
}

// Load environment variables
const envResult = dotenv.config({ path: envPath });

if (envResult.error) {
  console.warn('⚠️  Error loading .env file:', envResult.error.message);
} else {
  console.log('✅ Environment variables loaded');
}

// Import Routes
import authRoutes from './routes/auth.routes.js';
import loanRoutes from './routes/loan.routes.js';
import applicationRoutes from './routes/application.routes.js';
import userRoutes from './routes/user.routes.js';
import adminRoutes from './routes/admin.routes.js';
import contentRoutes from './routes/content.routes.js';
import homeRoutes from './routes/home.routes.js';
import categoryRoutes from './routes/category.routes.js';
import formFieldRoutes from './routes/formField.routes.js';
import eligibilityRoutes from './routes/eligibility.routes.js';

const app = express();

// CORS Configuration - Must be before any routes
const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://before-salary-frontend.onrender.com',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow all origins in development
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin) || origin.includes('localhost')) {
      callback(null, true);
    } else {
      console.log('CORS blocked origin:', origin);
      callback(null, true); // Allow anyway for now, change to false for strict security
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Length', 'Content-Type']
}));

// Additional CORS headers middleware for all requests
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin) || !origin || origin.includes('localhost')) {
    res.header('Access-Control-Allow-Origin', origin || '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Expose-Headers', 'Content-Length, Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files with explicit CORS headers and proper route handler
// Handle OPTIONS requests first
app.options('/uploads/*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS, HEAD');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range, Authorization');
  res.sendStatus(200);
});

// Serve static files with explicit CORS headers
app.use('/uploads', (req, res, next) => {
  // Set CORS headers explicitly before serving files
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, OPTIONS, HEAD');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range, Authorization');
  res.header('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS' || req.method === 'HEAD') {
    return res.sendStatus(200);
  }
  next();
}, express.static(path.join(__dirname, 'uploads'), {
  setHeaders: (res, filePath, stat) => {
    // Set CORS headers for all files
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS, HEAD');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Range');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Content-Type');
    
    // Set proper content-type based on file extension
    const ext = path.extname(filePath).toLowerCase();
    if (ext === '.pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename="' + path.basename(filePath) + '"');
    } else if (ext === '.jpg' || ext === '.jpeg') {
      res.setHeader('Content-Type', 'image/jpeg');
    } else if (ext === '.png') {
      res.setHeader('Content-Type', 'image/png');
    } else if (ext === '.doc' || ext === '.docx') {
      res.setHeader('Content-Type', 'application/msword');
    }
    
    // Set cache headers
    res.setHeader('Cache-Control', 'public, max-age=31536000');
    res.setHeader('Accept-Ranges', 'bytes');
  },
  dotfiles: 'allow',
  index: false
}));

// Database Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB Connected Successfully'))
  // .then(() => console.log("MONGODB_URI"))
  .catch((error) => console.error('MongoDB Connection Error:', error));

// SMTP Configuration Verification
import { verifySMTPConnection, diagnoseSMTPConfig } from './utils/sendEmail.js';

// Verify SMTP connection on startup (non-blocking)
(async () => {
  try {
    // First run diagnosis
    console.log('\n' + '='.repeat(50));
    console.log('🔍 SMTP Configuration Check');
    console.log('='.repeat(50));
    diagnoseSMTPConfig();
    
    // Then verify connection
    const result = await verifySMTPConnection();
    if (result.success) {
      console.log('✅ SMTP configuration verified successfully');
    } else {
      console.warn('\n⚠️  SMTP verification failed:', result.error);
      console.warn('⚠️  Email functionality may not work. Please check your .env file:');
      console.warn('   - EMAIL_HOST (must be set to your SMTP server, e.g., smtp.gmail.com)');
      console.warn('   - EMAIL_PORT (usually 587 for TLS or 465 for SSL)');
      console.warn('   - EMAIL_USER (your email address)');
      console.warn('   - EMAIL_PASS (for Gmail, use an App Password)');
      if (result.details) {
        console.warn('   Details:', result.details);
      }
      console.warn('\n💡 Make sure your .env file is in the Server/ directory');
      console.warn('='.repeat(50) + '\n');
    }
  } catch (error) {
    console.error('❌ SMTP verification error:', error.message);
    console.error('='.repeat(50) + '\n');
  }
})();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/loans', loanRoutes);
app.use('/api/applications', applicationRoutes);
app.use('/api/user', userRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/content', contentRoutes);
app.use('/api/home', homeRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/form-fields', formFieldRoutes);
app.use('/api/eligibility', eligibilityRoutes); 


// Test Route for deployment check
app.get('/', (req, res) => {
  res.send('🚀 Backend Server is Running Successfully!');
});

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// SMTP Test Endpoint (for debugging)
app.get('/api/test-smtp', async (req, res) => {
  try {
    const { verifySMTPConnection, diagnoseSMTPConfig, sendOTPEmail } = await import('./utils/sendEmail.js');
    
    // Run diagnosis
    const diagnosis = diagnoseSMTPConfig();
    
    // Try to verify connection
    const verification = await verifySMTPConnection();
    
    // Try to send a test email if test email is provided
    const { testEmail } = req.query;
    let testResult = null;
    if (testEmail) {
      const testOtp = '123456';
      testResult = await sendOTPEmail(testEmail, testOtp, 'test');
    }
    
    res.json({
      success: true,
      diagnosis: {
        configValid: diagnosis,
        envPath: process.env.EMAIL_HOST ? 'SET' : 'NOT SET',
        emailHost: process.env.EMAIL_HOST || 'NOT SET',
        emailPort: process.env.EMAIL_PORT || 'NOT SET',
        emailUser: process.env.EMAIL_USER ? `${process.env.EMAIL_USER.substring(0, 3)}***` : 'NOT SET',
        emailPass: process.env.EMAIL_PASS ? 'SET' : 'NOT SET'
      },
      verification: verification,
      testEmail: testResult
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Error Handling Middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false, 
    message: err.message || 'Internal Server Error' 
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT,"0.0.0.0", () => {
  console.log(`Server is running on port ${PORT}`);
});



