import mongoose from 'mongoose';

const safeNum = v => {
  if (v === '' || v === null || v === undefined || v === 'NaN') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const loanSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  slug: {
    type: String,
    required: true,
    unique: true,
    lowercase: true
  },
  type: {
    type: String,
    required: true
    // Removed enum constraint to allow dynamic categories from Loan Categories section
  },
  description: {
    type: String,
    required: true
  },
  features: [{
    title: String,
    description: String
  }],
  benefits: [{
    title: String,
    description: String
  }],
  eligibilityCriteria: {
    minAge: { type: Number, default: 18 },
    maxAge: { type: Number, default: 65 },
    minIncome: { type: Number, default: 25000 },
    minCreditScore: { type: Number, default: 600 },
    employmentType: [String], // ['Salaried', 'Self-Employed', 'Business']
    otherCriteria: [String]
  },
  requiredDocuments: [{
    name: String,
    description: String,
    required: { type: Boolean, default: true }
  }],
  repaymentOptions: [{
    tenure: Number, // in months
    interestRate: Number, // annual percentage
    emi: Number // example EMI
  }],
  interestRate: {
    min: { type: Number, required: true },
    max: { type: Number, required: true },
    default: { type: Number, required: true }
  },
  minLoanAmount: {
    type: Number,
    required: true
  },
  maxLoanAmount: {
    type: Number,
    required: true
  },
  minTenure: {
    type: Number, // in months
    required: true
  },
  maxTenure: {
    type: Number, // in months
    required: true
  },
  image: {
    type: String,
    default: ''
  },
  isActive: {
    type: Boolean,
    default: true
  },
  order: {
    type: Number,
    default: 0
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  loanProductId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LoanProduct'
  },
  loanDetails: {
    principal: { type: Number, set: safeNum },
    annualRate: { type: Number, set: safeNum },
    tenureMonths: { type: Number, set: safeNum },
    emi: { type: Number, set: safeNum } // optional
  },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'LoanCategory', index: true }
}, {
  timestamps: true
});

// Remove empty string values for ObjectId refs
loanSchema.pre('validate', function(next) {
  ['user','loanProductId','_id'].forEach(f => {
    if (this[f] === '') this[f] = undefined;
  });
  next();
});

// Compute EMI if missing
loanSchema.pre('validate', function(next) {
  const ld = this.loanDetails || {};
  ['principal','annualRate','tenureMonths','emi'].forEach(f => {
    ld[f] = safeNum(ld[f]);
  });

  // Compute EMI only if absent and inputs valid
  if (ld.emi == null && ld.principal && ld.annualRate && ld.tenureMonths) {
    const P = ld.principal, r = (ld.annualRate / 12) / 100, n = ld.tenureMonths;
    if (P > 0 && r > 0 && n > 0) {
      const pow = Math.pow(1 + r, n);
      const emi = P * r * pow / (pow - 1);
      if (Number.isFinite(emi)) ld.emi = Number(emi.toFixed(2));
    }
  }

  // Do not error if emi still undefined
  this.loanDetails = ld;
  next();
});

export default mongoose.model('Loan', loanSchema);



