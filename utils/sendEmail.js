import nodemailer from "nodemailer";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

// Ensure environment variables are loaded (in case this module is imported before server.js)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.join(__dirname, '..', '.env');

// Reload env if .env file exists and variables are missing
if (existsSync(envPath) && (!process.env.EMAIL_HOST || !process.env.EMAIL_PORT)) {
  console.log('🔄 Reloading environment variables from:', envPath);
  const result = dotenv.config({ path: envPath });
  if (result.error) {
    console.error('❌ Error loading .env:', result.error.message);
  }
}

// Diagnostic function to check environment
function diagnoseSMTPConfig() {
  console.log('\n📋 SMTP Configuration Diagnosis:');
  console.log('   .env file path:', envPath);
  console.log('   .env file exists:', existsSync(envPath));
  console.log('   EMAIL_HOST:', process.env.EMAIL_HOST || '❌ NOT SET');
  console.log('   EMAIL_PORT:', process.env.EMAIL_PORT || '❌ NOT SET');
  console.log('   EMAIL_USER:', process.env.EMAIL_USER ? `${process.env.EMAIL_USER.substring(0, 3)}***` : '❌ NOT SET');
  console.log('   EMAIL_PASS:', process.env.EMAIL_PASS ? '***SET***' : '❌ NOT SET');
  
  if (!process.env.EMAIL_HOST || process.env.EMAIL_HOST.trim() === '') {
    console.error('\n❌ CRITICAL: EMAIL_HOST is not set!');
    console.error('   This will cause nodemailer to default to localhost (127.0.0.1)');
    console.error('   Please set EMAIL_HOST in your .env file');
    return false;
  }
  
  if (process.env.EMAIL_HOST === 'localhost' || process.env.EMAIL_HOST === '127.0.0.1') {
    console.error('\n❌ CRITICAL: EMAIL_HOST is set to localhost!');
    console.error('   Please set EMAIL_HOST to your actual SMTP server (e.g., smtp.gmail.com)');
    return false;
  }
  
  return true;
}

// Export diagnostic function
export { diagnoseSMTPConfig };

// Validate SMTP environment variables
function validateSMTPConfig() {
  const required = ['EMAIL_HOST', 'EMAIL_PORT', 'EMAIL_USER', 'EMAIL_PASS'];
  const missing = [];
  const empty = [];
  
  // Check for missing or empty values
  required.forEach(key => {
    const value = process.env[key];
    if (!value) {
      missing.push(key);
    } else if (typeof value === 'string' && value.trim() === '') {
      empty.push(key);
    }
  });
  
  if (missing.length > 0) {
    console.error('❌ SMTP Configuration Error: Missing environment variables:', missing.join(', '));
    console.error('   Please check your .env file in the Server directory');
    return false;
  }
  
  if (empty.length > 0) {
    console.error('❌ SMTP Configuration Error: Empty environment variables:', empty.join(', '));
    console.error('   These variables are set but have no value. Please check your .env file');
    return false;
  }
  
  const port = Number(process.env.EMAIL_PORT);
  if (isNaN(port) || port <= 0) {
    console.error('❌ SMTP Configuration Error: EMAIL_PORT must be a valid number');
    console.error(`   Current value: "${process.env.EMAIL_PORT}"`);
    return false;
  }
  
  // Validate EMAIL_HOST is not localhost or empty
  const host = process.env.EMAIL_HOST.trim();
  if (!host || host === 'localhost' || host === '127.0.0.1') {
    console.error('❌ SMTP Configuration Error: EMAIL_HOST cannot be localhost or empty');
    console.error(`   Current value: "${host}"`);
    console.error('   Please set EMAIL_HOST to your SMTP server (e.g., smtp.gmail.com)');
    return false;
  }
  
  return true;
}

// Create transporter with validation
function createTransporter() {
  // Run diagnosis first
  if (!diagnoseSMTPConfig()) {
    console.error('❌ Cannot create SMTP transporter due to configuration errors');
    return null;
  }
  
  if (!validateSMTPConfig()) {
    return null;
  }
  
  // Trim and validate values
  const host = process.env.EMAIL_HOST.trim();
  const port = Number(process.env.EMAIL_PORT);
  const user = process.env.EMAIL_USER.trim();
  const pass = process.env.EMAIL_PASS.trim();
  
  // Log configuration (without password)
  console.log('📧 SMTP Configuration:');
  console.log(`   Host: ${host}`);
  console.log(`   Port: ${port}`);
  console.log(`   User: ${user}`);
  console.log(`   Secure: ${port === 465}`);
  
  // Configure based on port
  const isSecure = port === 465;
  const useTLS = port === 587;
  
  const config = {
    
    host: "smtp-relay.brevo.com",
    port: 465,
    secure: false, // true for 465 (SSL), false for other ports
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    // Connection timeout options
    connectionTimeout: 20000, // 20 seconds
    greetingTimeout: 20000,
    socketTimeout: 20000,
    // TLS configuration for port 587
    requireTLS: useTLS, // Require TLS for port 587
    tls: {
      rejectUnauthorized: false, // Allow self-signed certificates
      minVersion: 'TLSv1.2', // Minimum TLS version
    },
    // Debug mode for troubleshooting
    debug: process.env.NODE_ENV === 'development' || process.env.SMTP_DEBUG === 'true',
    logger: process.env.NODE_ENV === 'development' || process.env.SMTP_DEBUG === 'true',
  };
  
  // Special handling for Gmail
  if (host.includes('gmail.com')) {
    console.log('   Detected Gmail SMTP - applying Gmail-specific settings');
    config.service = 'gmail'; // Use Gmail service
    // Gmail requires App Password, not regular password
    if (!pass || pass.length < 16) {
      console.warn('   ⚠️  Warning: Gmail password seems too short. Make sure you\'re using an App Password (16 characters), not your regular password.');
    }
  }
  
  console.log('   Configuration:', {
    host: host,
    port: port,
    secure: isSecure,
    requireTLS: useTLS,
    service: config.service || 'custom'
  });
  
  try {
    const transporter = nodemailer.createTransport(config);
    console.log('✅ SMTP transporter created successfully');
    return transporter;
  } catch (error) {
    console.error('❌ Failed to create SMTP transporter:', error.message);
    return null;
  }
}

// Lazy initialization of transporter with ability to recreate
let transporter = null;
let transporterInitialized = false;
let lastConfigHash = null;

function getConfigHash() {
  return `${process.env.EMAIL_HOST || ''}_${process.env.EMAIL_PORT || ''}_${process.env.EMAIL_USER || ''}`;
}

function getTransporter() {
  const currentConfigHash = getConfigHash();
  
  // Recreate transporter if config changed or not initialized
  if (!transporterInitialized || lastConfigHash !== currentConfigHash) {
    console.log('🔄 Creating/recreating SMTP transporter...');
    transporter = createTransporter();
    transporterInitialized = true;
    lastConfigHash = currentConfigHash;
    
    if (!transporter) {
      console.error('❌ Failed to create SMTP transporter');
      console.error('   This means emails cannot be sent');
      console.error('   Please check your .env file configuration');
    }
  }
  
  return transporter;
}

// Verify SMTP connection
export async function verifySMTPConnection() {
  console.log('\n🔍 Verifying SMTP configuration...');
  console.log('   EMAIL_HOST:', process.env.EMAIL_HOST || '❌ NOT SET');
  console.log('   EMAIL_PORT:', process.env.EMAIL_PORT || '❌ NOT SET');
  console.log('   EMAIL_USER:', process.env.EMAIL_USER ? `${process.env.EMAIL_USER.substring(0, 3)}***` : '❌ NOT SET');
  console.log('   EMAIL_PASS:', process.env.EMAIL_PASS ? '***SET***' : '❌ NOT SET');
  
  const trans = getTransporter();
  if (!trans) {
    const error = 'SMTP configuration is invalid. Please check environment variables in .env file.';
    console.error('❌', error);
    return { 
      success: false, 
      error: error,
      details: 'Make sure EMAIL_HOST, EMAIL_PORT, EMAIL_USER, and EMAIL_PASS are set in Server/.env'
    };
  }
  
  try {
    console.log('   Attempting to verify SMTP connection...');
    await trans.verify();
    console.log('✅ SMTP connection verified successfully\n');
    return { success: true };
  } catch (err) {
    console.error('❌ SMTP verification failed:', err.message);
    console.error('   Error code:', err.code);
    
    let helpfulMessage = err.message;
    if (err.code === 'ESOCKET' || err.code === 'ECONNREFUSED') {
      const host = process.env.EMAIL_HOST || 'NOT SET';
      if (host === 'NOT SET' || host.trim() === '' || host === 'localhost' || host === '127.0.0.1') {
        helpfulMessage = 'EMAIL_HOST is not configured or set to localhost. Please set EMAIL_HOST to your SMTP server (e.g., smtp.gmail.com).';
      } else {
        helpfulMessage = `Cannot connect to ${host}:${process.env.EMAIL_PORT}. Check your network and firewall settings.`;
      }
    } else if (err.code === 'EAUTH') {
      helpfulMessage = 'SMTP authentication failed. For Gmail, use an App Password instead of your regular password.';
    }
    
    return { 
      success: false, 
      error: helpfulMessage,
      code: err.code,
      originalError: err.message,
      details: 'Please check your EMAIL_HOST, EMAIL_PORT, EMAIL_USER, and EMAIL_PASS in Server/.env file'
    };
  }
}

export async function sendEmail({ to, subject, html, text }) {
  const trans = getTransporter();
  
  if (!trans) {
    return { 
      success: false, 
      error: 'SMTP is not configured. Please set EMAIL_HOST, EMAIL_PORT, EMAIL_USER, and EMAIL_PASS environment variables.',
      code: 'ENOCONFIG'
    };
  }
  
  // Validate required fields
  if (!to || !subject) {
    return { 
      success: false, 
      error: 'Missing required fields: to and subject are required',
      code: 'EMISSING'
    };
  }
  
  try {
    const info = await trans.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to,
      subject,
      html,
      text: text || html?.replace(/<[^>]*>/g, ''), // Fallback to plain text from HTML if text not provided
    });
    
    console.log('✅ Email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error('❌ Email sending failed:', err.message);
    console.error('   Error code:', err.code);
    console.error('   SMTP Host:', process.env.EMAIL_HOST || 'NOT SET');
    console.error('   SMTP Port:', process.env.EMAIL_PORT || 'NOT SET');
    
    // Provide more helpful error messages
    let errorMessage = err.message;
    let helpfulHint = '';
    
    if (err.code === 'EAUTH') {
      errorMessage = 'SMTP authentication failed. Please verify EMAIL_USER and EMAIL_PASS.';
      helpfulHint = 'For Gmail, you must use an App Password, not your regular password.';
    } else if (err.code === 'ECONNECTION' || err.code === 'ETIMEDOUT' || err.code === 'ESOCKET') {
      const host = process.env.EMAIL_HOST || 'NOT SET';
      const port = process.env.EMAIL_PORT || 'NOT SET';
      
      if (host === 'NOT SET' || host.trim() === '' || host === 'localhost' || host === '127.0.0.1') {
        errorMessage = 'SMTP host is not configured correctly. EMAIL_HOST is missing or set to localhost.';
        helpfulHint = 'Please set EMAIL_HOST in your .env file (e.g., smtp.gmail.com for Gmail).';
      } else {
        errorMessage = `Cannot connect to SMTP server at ${host}:${port}.`;
        helpfulHint = 'Please verify EMAIL_HOST and EMAIL_PORT are correct. Check your firewall and network connection.';
      }
    } else if (err.code === 'EENVELOPE') {
      errorMessage = 'Invalid email address. Please check the recipient email.';
    } else if (err.code === 'ETIMEDOUT') {
      errorMessage = 'SMTP connection timed out.';
      helpfulHint = 'The SMTP server did not respond in time. Check your network connection and EMAIL_HOST.';
    }
    
    return { 
      success: false, 
      error: errorMessage,
      code: err.code,
      originalError: err.message,
      hint: helpfulHint,
      config: {
        host: process.env.EMAIL_HOST || 'NOT SET',
        port: process.env.EMAIL_PORT || 'NOT SET',
        user: process.env.EMAIL_USER ? `${process.env.EMAIL_USER.substring(0, 3)}***` : 'NOT SET'
      }
    };
  }
}

export async function sendOTPEmail(to, otp, purpose = "verification") {
  console.log(`\n📧 Preparing to send OTP email...`);
  console.log(`   To: ${to}`);
  console.log(`   Purpose: ${purpose}`);
  console.log(`   OTP: ${otp}`);
  
  // Validate email format
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    console.error('❌ Invalid email address:', to);
    return {
      success: false,
      error: 'Invalid email address format',
      code: 'EINVALID'
    };
  }
  
  const subject = `Your OTP for ${purpose}`;
  const html = `
    <div style="font-family:Arial, sans-serif; line-height:1.6; max-width:600px; margin:0 auto; padding:20px; background-color:#f9f9f9;">
      <div style="background-color:white; padding:30px; border-radius:10px; box-shadow:0 2px 4px rgba(0,0,0,0.1);">
        <h2 style="color:#333; margin-top:0;">Your OTP Code</h2>
        <p style="color:#666; font-size:16px;">Your OTP for <strong>${purpose}</strong> is:</p>
        <div style="background-color:#fff3cd; border:2px solid #ffc107; border-radius:8px; padding:20px; text-align:center; margin:20px 0;">
          <h1 style="font-size:36px; letter-spacing:8px; color:#856404; margin:0; font-weight:bold;">${otp}</h1>
        </div>
        <p style="color:#666; font-size:14px;">This OTP will expire in 10 minutes.</p>
        <p style="color:#999; font-size:12px; margin-top:30px; border-top:1px solid #eee; padding-top:20px;">If you didn't request this OTP, please ignore this email.</p>
      </div>
    </div>
  `;
  const text = `Your OTP for ${purpose} is: ${otp}\n\nThis OTP will expire in 10 minutes.\n\nIf you didn't request this OTP, please ignore this email.`;
  
  const result = await sendEmail({ to, subject, html, text });
  
  if (result.success) {
    console.log(`✅ OTP email sent successfully to ${to}`);
    console.log(`   Message ID: ${result.messageId}`);
  } else {
    console.error(`❌ Failed to send OTP email to ${to}`);
    console.error(`   Error: ${result.error}`);
    console.error(`   Code: ${result.code}`);
  }
  
  return result;
}
