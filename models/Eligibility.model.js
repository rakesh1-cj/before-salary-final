import mongoose from 'mongoose';

const eligibilitySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  loanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Loan',
    required: false // Optional if user hasn't selected a loan yet
  },
  pancard: {
    type: String,
    required: true,
    uppercase: true,
    trim: true,
    maxlength: 10
  },
  dob: {
    type: Date,
    required: true
  },
  gender: {
    type: String,
    enum: ['MALE', 'FEMALE', 'OTHER'],
    required: true
  },
  personalEmail: {
    type: String,
    required: true,
    lowercase: true,
    trim: true
  },
  employmentType: {
    type: String,
    enum: ['SALARIED', 'SELF EMPLOYED'],
    required: true
  },
  companyName: {
    type: String,
    required: function() {
      return this.employmentType === 'SALARIED';
    },
    trim: true
  },
  nextSalaryDate: {
    type: Date,
    required: function() {
      return this.employmentType === 'SALARIED';
    }
  },
  netMonthlyIncome: {
    type: Number,
    required: true,
    min: 0
  },
  pinCode: {
    type: String,
    required: true,
    trim: true,
    match: /^\d{6}$/
  },
  state: {
    type: String,
    trim: true
  },
  city: {
    type: String,
    trim: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'pending'
  },
  rejectionReason: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Index for efficient queries
eligibilitySchema.index({ email: 1, createdAt: -1 });
eligibilitySchema.index({ loanId: 1, createdAt: -1 });

export default mongoose.model('Eligibility', eligibilitySchema);

