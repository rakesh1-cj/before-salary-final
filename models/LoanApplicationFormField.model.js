import mongoose from 'mongoose';

const loanApplicationFormFieldSchema = new mongoose.Schema({
  loanId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Loan',
    required: function() { return !this.categoryId; },
    index: true
  },
  categoryId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LoanCategory',
    required: function() { return !this.loanId; },
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['Text', 'Number', 'Email', 'Phone', 'Date', 'Textarea', 'Select', 'Checkbox', 'Radio', 'File'],
    default: 'Text',
    required: true
  },
  width: {
    type: String,
    enum: ['full', 'half', 'third', 'quarter'],
    default: 'full'
  },
  required: {
    type: Boolean,
    default: false
  },
  placeholder: {
    type: String,
    trim: true
  },
  label: {
    type: String,
    trim: true
  },
  options: [{
    type: String,
    trim: true
  }], // For Select, Radio types
  order: {
    type: Number,
    default: 0
  },
  section: {
    type: String,
    enum: ['employment', 'loanDetails', 'documents'],
    default: 'employment'
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Validation: Either loanId or categoryId must be provided
loanApplicationFormFieldSchema.pre('validate', function(next) {
  if (!this.loanId && !this.categoryId) {
    return next(new Error('Either loanId or categoryId must be provided'));
  }
  if (this.loanId && this.categoryId) {
    return next(new Error('Cannot specify both loanId and categoryId'));
  }
  next();
});

// Index for efficient queries
loanApplicationFormFieldSchema.index({ loanId: 1, order: 1 });
loanApplicationFormFieldSchema.index({ categoryId: 1, order: 1 });
loanApplicationFormFieldSchema.index({ categoryId: 1, section: 1, order: 1 });

export default mongoose.model('LoanApplicationFormField', loanApplicationFormFieldSchema);

