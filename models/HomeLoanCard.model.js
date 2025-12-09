import mongoose from 'mongoose';

const homeLoanCardSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  description: {
    type: String,
    required: true
  },
  icon: {
    type: String,
    required: true,
    default: 'CurrencyDollarIcon' // Default icon name
  },
  link: {
    type: String,
    default: '/eligibility'
  },
  order: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

export default mongoose.model('HomeLoanCard', homeLoanCardSchema);


