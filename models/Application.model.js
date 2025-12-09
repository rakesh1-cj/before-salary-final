import mongoose from 'mongoose';

const applicationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  loanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Loan',
    required: true
  },
  loanType: {
    type: String,
    required: true
  },
  personalInfo: {
    fullName: { type: String, required: true },
    email: { type: String, required: true },
    phone: { type: String, required: true },
    dateOfBirth: Date,
    gender: String,
    pan: String,
    aadhar: String,
    maritalStatus: String,
    numberOfDependents: Number
  },
  address: {
    current: {
      street: String,
      city: String,
      state: String,
      pincode: String,
      country: { type: String, default: 'India' }
    },
    permanent: {
      street: String,
      city: String,
      state: String,
      pincode: String,
      country: { type: String, default: 'India' }
    }
  },
  employmentInfo: {
    employmentType: { type: String, required: true },
    companyName: String,
    designation: String,
    workExperience: Number, // in years
    monthlyIncome: { type: Number, required: true },
    businessType: String, // for self-employed
    businessAge: Number // in years
  },
  loanDetails: {
    loanAmount: { type: Number, required: true },
    loanTenure: { type: Number, required: true }, // in months
    purpose: String,
    interestRate: Number,
    emi: Number
  },
  documents: [{
    type: { type: String, required: true }, // 'ID', 'Address', 'Income', 'Bank Statement', etc.
    name: { type: String, required: true },
    url: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['Pending', 'Verified', 'Rejected'], default: 'Pending' }
  }],
  status: {
    type: String,
    enum: ['Draft', 'Submitted', 'Under Review', 'Documents Pending', 'Approved', 'Rejected'],
    default: 'Draft'
  },
  adminNotes: [{
    note: String,
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    addedAt: { type: Date, default: Date.now }
  }],
  rejectionReason: String,
  approvedAt: Date,
  rejectedAt: Date,
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  applicationNumber: {
    type: String,
    unique: true
  },
  dynamicFields: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Generate application number before saving
applicationSchema.pre('save', async function(next) {
  if (!this.applicationNumber && this.status !== 'Draft') {
    const count = await mongoose.model('Application').countDocuments();
    this.applicationNumber = `APP${String(count + 1).padStart(6, '0')}`;
  }
  next();
});

export default mongoose.model('Application', applicationSchema);



