import express from 'express';
import User from '../models/User.model.js';
import OTP from '../models/OTP.model.js';
import { generateToken, generateOTP } from '../utils/generateToken.js';
import { sendOTPEmail } from '../utils/sendEmail.js';
import { protect } from '../middleware/auth.middleware.js';
import dotenv from 'dotenv';
dotenv.config();

const router = express.Router();

// SMTP verification removed - emails will be sent on-demand without startup checks

// SMTP status route removed - no longer needed without verification

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    // Validation
    if (!name || !email || !phone || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide all required fields'
      });
    }

    // Check if user exists
    const userExists = await User.findOne({ $or: [{ email }, { phone }] });
    if (userExists) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email or phone'
      });
    }

    // Create user
    const newUser = await User.create({
      name,
      email,
      phone,
      password
    });

    // Generate token
    const token = generateToken(newUser._id);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone,
        role: newUser.role
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }

    // Find user and include password
    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   POST /api/auth/forgot-password
// @desc    Send password reset OTP to user's email
// @access  Public
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email',
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found with this email',
      });
    }

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    user.otp = {
      code: otp,
      expiresAt,
      purpose: 'password_reset',
    };
    await user.save();

    let emailResult;
    try {
      emailResult = await sendOTPEmail(email, otp, 'password reset');
    } catch (err) {
      emailResult = { success: false, error: err.message, code: err.code };
    }

    if (!emailResult.success) {
      const authFail =
        emailResult.code === 'EAUTH' ||
        /auth/i.test(emailResult.error || '');
      const baseMessage = authFail
        ? 'SMTP authentication failed.'
        : emailResult.error || 'Failed to send reset email.';

      return res.status(500).json({
        success: false,
        message: baseMessage,
        code: emailResult.code,
      });
    }

    return res.json({
      success: true,
      message:
        'Password reset OTP has been sent to your email. It will expire in 10 minutes.',
    });
  } catch (error) {
    console.error('[FORGOT_PASSWORD_FATAL]', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
});

// @route   POST /api/auth/reset-password
// @desc    Reset password using email + OTP
// @access  Public
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email, OTP and new password',
      });
    }

    const user = await User.findOne({ email }).select('+password');

    if (!user || !user.otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP or user not found',
      });
    }

    if (
      user.otp.purpose !== 'password_reset' ||
      user.otp.code !== otp
    ) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP',
      });
    }

    if (new Date() > user.otp.expiresAt) {
      return res.status(400).json({
        success: false,
        message: 'OTP has expired',
      });
    }

    // Set new password and clear OTP
    user.password = newPassword;
    user.otp = undefined;
    await user.save();

    return res.json({
      success: true,
      message: 'Password has been reset successfully. You can now log in.',
    });
  } catch (error) {
    console.error('[RESET_PASSWORD_FATAL]', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error',
    });
  }
});

// @route   POST /api/auth/send-otp
// @desc    Send OTP for email/phone verification or login
// @access  Public
router.post('/send-otp', async (req, res) => {
  try {
    const { email, phone, purpose } = req.body;
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // For application purpose, store OTP in temporary OTP collection
    if (purpose === 'application') {
      if (email) {
        // Delete any existing OTP for this email
        await OTP.deleteMany({ email, purpose: 'application' });
        
        // Create new OTP record
        await OTP.create({
          email,
          code: otp,
          purpose: 'application',
          expiresAt
        });

        // Send OTP via email
        let emailResult;
        try {
          console.log(`\n📧 Attempting to send OTP email to: ${email}`);
          console.log(`   OTP Code: ${otp}`);
          emailResult = await sendOTPEmail(email, otp, 'application');
          
          if (!emailResult.success) {
            console.error('❌ Email sending failed:', emailResult);
            console.error('   Error details:', {
              code: emailResult.code,
              error: emailResult.error,
              hint: emailResult.hint,
              config: emailResult.config
            });
          }
        } catch (err) {
          console.error('[SMTP] Uncaught sendOTPEmail error:', err);
          console.error('   Stack:', err.stack);
          emailResult = { 
            success: false, 
            error: err.message, 
            code: err.code || 'EUNKNOWN',
            originalError: err.toString()
          };
        }

        if (!emailResult.success) {
          // Build comprehensive error message
          let errorMessage = emailResult.error || 'Failed to send OTP email.';
          if (emailResult.hint) {
            errorMessage += ` ${emailResult.hint}`;
          }
          
          // Log full error for debugging
          console.error('\n❌ ========================================');
          console.error('❌ SMTP ERROR - OTP NOT SENT');
          console.error('❌ ========================================');
          console.error('   Email:', email);
          console.error('   Error:', errorMessage);
          console.error('   Code:', emailResult.code);
          if (emailResult.config) {
            console.error('   Config:', emailResult.config);
          }
          console.error('❌ ========================================\n');
          
          return res.status(500).json({
            success: false,
            message: errorMessage,
            smtpErrorCode: emailResult.code,
            ...(emailResult.config && { smtpConfig: emailResult.config }),
            // expose OTP only outside production for debugging
            ...(process.env.NODE_ENV !== 'production' && { devOtp: otp })
          });
        }

        console.log(`\n========================================`);
        console.log(`✅ OTP EMAIL SENT SUCCESSFULLY`);
        console.log(`📧 Email: ${email}`);
        console.log(`🔑 OTP: ${otp}`);
        console.log(`⏰ Expires at: ${expiresAt}`);
        console.log(`📬 Message ID: ${emailResult.messageId || 'N/A'}`);
        console.log(`========================================\n`);

        return res.json({
          success: true,
          message: 'OTP sent successfully to your email address. Please check your inbox.',
          otpExpiresIn: 600, // 10 minutes in seconds
          // In development only, return OTP for testing
          ...(process.env.NODE_ENV !== 'production' && { devOtp: otp })
        });
      } else if (phone) {
        // Delete any existing OTP for this phone
        await OTP.deleteMany({ phone, purpose: 'application' });
        
        // Create new OTP record
        await OTP.create({
          phone,
          code: otp,
          purpose: 'application',
          expiresAt
        });

        // TODO: Send OTP via SMS
        console.log(`\n========================================`);
        console.log(`📱 OTP SENT FOR APPLICATION`);
        console.log(`Phone: ${phone}`);
        console.log(`OTP Code: ${otp}`);
        console.log(`Expires at: ${expiresAt}`);
        console.log(`========================================\n`);

        return res.json({
          success: true,
          message: 'OTP sent successfully',
          otpExpiresIn: 600, // 10 minutes in seconds
          // In development, return OTP (remove in production)
          ...(process.env.NODE_ENV !== 'production' && { devOtp: otp })
        });
      } else {
        return res.status(400).json({
          success: false,
          message: 'Please provide email or phone for application OTP'
        });
      }
    }

    // For other purposes, use existing user-based OTP flow
    let user;
    if (email) {
      user = await User.findOne({ email });
      if (!user && purpose !== 'login') {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
    }

    if (phone && !email) {
      user = await User.findOne({ phone });
      if (!user && purpose !== 'login') {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }
    }

    if (user) {
      user.otp = {
        code: otp,
        expiresAt,
        purpose: purpose || 'verification'
      };
      await user.save();
    }

    // Send OTP via email if email is provided
    if (email) {
      let emailResult;
      try {
        emailResult = await sendOTPEmail(email, otp, purpose || 'verification');
      } catch (err) {
        emailResult = { success: false, error: err.message, code: err.code };
      }

      if (!emailResult.success) {
        return res.status(500).json({
          success: false,
          message: 'Failed to send OTP email',
          error: emailResult.error,
          code: emailResult.code
        });
      }
    }

    // TODO: Send OTP via SMS if phone is provided
    if (phone && !email) {
      console.log(`OTP for ${phone}: ${otp}`); // For development - remove in production
    }

    return res.json({
      success: true,
      message: 'OTP sent successfully',
      otpExpiresIn: 600, // 10 minutes in seconds
      ...(process.env.NODE_ENV !== 'production' && { devOtp: otp })
    });
  } catch (error) {
    console.error('[SEND_OTP_FATAL]', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   POST /api/auth/verify-otp
// @desc    Verify OTP
// @access  Public
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, phone, otp, purpose } = req.body;

    if (!otp || (!email && !phone)) {
      return res.status(400).json({
        success: false,
        message: 'Please provide OTP and email or phone'
      });
    }

    // For application purpose, verify from temporary OTP collection
    if (purpose === 'application') {
      let query = { purpose: 'application', verified: false };
      if (email) {
        query.email = email;
      } else if (phone) {
        query.phone = phone;
      } else {
        return res.status(400).json({
          success: false,
          message: 'Please provide email or phone'
        });
      }

      const otpRecord = await OTP.findOne(query);

      if (!otpRecord) {
        return res.status(400).json({
          success: false,
          message: 'Invalid OTP or OTP not found'
        });
      }

      // Check if OTP is expired
      if (new Date() > otpRecord.expiresAt) {
        await OTP.deleteOne({ _id: otpRecord._id });
        return res.status(400).json({
          success: false,
          message: 'OTP has expired'
        });
      }

      // Check if OTP matches
      if (otpRecord.code !== otp) {
        return res.status(400).json({
          success: false,
          message: 'Invalid OTP'
        });
      }

      // Mark OTP as verified
      otpRecord.verified = true;
      await otpRecord.save();

      return res.json({
        success: true,
        message: 'OTP verified successfully',
        ...(email && { email }),
        ...(phone && { phone })
      });
    }

    // For other purposes, use existing user-based OTP flow
    let query = {};
    if (email) query.email = email;
    if (phone) query.phone = phone;

    const user = await User.findOne(query);

    if (!user || !user.otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP or OTP not found'
      });
    }

    // Check if OTP is expired
    if (new Date() > user.otp.expiresAt) {
      return res.status(400).json({
        success: false,
        message: 'OTP has expired'
      });
    }

    // Check if OTP matches
    if (user.otp.code !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP'
      });
    }

    // Update verification status based on purpose
    if (purpose === 'email' || (purpose === 'verification' && email)) {
      user.isVerified.email = true;
    }
    if (purpose === 'phone' || (purpose === 'verification' && phone)) {
      user.isVerified.phone = true;
    }

    // Clear OTP
    user.otp = undefined;
    await user.save();

    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'OTP verified successfully',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        isVerified: user.isVerified
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   POST /api/auth/firebase-login
// @desc    Login with Firebase
// @access  Public
router.post('/firebase-login', async (req, res) => {
  try {
    const { idToken, email, name } = req.body;

    if (!idToken || !email) {
      return res.status(400).json({
        success: false,
        message: 'Please provide Firebase ID token and email'
      });
    }

    // Verify Firebase token (in production, verify with Firebase Admin SDK)
    // For now, we'll trust the token and find or create user
    let user = await User.findOne({ email });

    if (!user) {
      // Create new user if doesn't exist
      user = await User.create({
        name: name || email.split('@')[0],
        email,
        phone: '', // Firebase users might not have phone
        password: '', // No password for Firebase users
        isVerified: {
          email: true,
          phone: false
        }
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    const token = generateToken(user._id);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   GET /api/auth/me
// @desc    Get current user
// @access  Private
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    res.json({
      success: true,
      user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// sendEmail now re-exported from sendEmail.js (used by application.routes.js)

// (Category management added separately; no change here)
// NOTE: Ensure in server.js:
// import categoryRoutes from './routes/category.routes.js';
// app.use('/api/categories', categoryRoutes);
// Without this, /api/categories will 404.

export default router;

