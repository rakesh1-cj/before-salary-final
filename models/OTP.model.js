import mongoose from 'mongoose';

const otpSchema = new mongoose.Schema({
  phone: {
    type: String,
    index: true
  },
  email: {
    type: String,
    index: true
  },
  code: {
    type: String,
    required: true
  },
  purpose: {
    type: String,
    enum: ['email', 'phone', 'login', 'application'],
    default: 'verification'
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 } // Auto-delete expired OTPs
  },
  verified: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Index for faster lookups
otpSchema.index({ phone: 1, code: 1 });
otpSchema.index({ email: 1, code: 1 });

export default mongoose.model('OTP', otpSchema);

