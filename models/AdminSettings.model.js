import mongoose from 'mongoose';

const adminSettingsSchema = new mongoose.Schema({
  siteName: {
    type: String,
    default: 'Beforesalary'
  },
  siteTagline: {
    type: String,
    default: 'For Brighter Tomorrow'
  },
  siteLogo: String,
  favicon: String,
  navigation: [{
    label: String,
    path: String,
    icon: String,
    order: { type: Number, default: 0 },
    isVisible: { type: Boolean, default: true },
    isPublic: { type: Boolean, default: true }
  }],
  contactInfo: {
    email: String,
    phone: String,
    address: String,
    workingHours: String
  },
  socialMedia: {
    facebook: String,
    instagram: String,
    twitter: String,
    linkedin: String,
    youtube: String
  },
  whatsappNumber: String,
  liveChatEnabled: {
    type: Boolean,
    default: true
  },
  heroBanner: {
    title: { type: String, default: 'Get an instant personal loan in minutes' },
    subtitle: { type: String, default: 'BeforeSalary makes borrowing easy with fast approvals, fair terms, and convenient repayment plans' },
    image: String,
    backgroundImage: String,
    backgroundColor: { type: String, default: 'orange' }, // orange, blue, gradient
    ctaText: { type: String, default: 'Start Now' },
    ctaLink: { type: String, default: '/apply' },
    showGooglePlay: { type: Boolean, default: true },
    showWhatsApp: { type: Boolean, default: true },
    googlePlayLink: String,
    whatsappLink: String,
    isActive: { type: Boolean, default: true }
  },
  defaultInterestRates: {
    personal: Number,
    business: Number,
    home: Number,
    vehicle: Number,
    education: Number
  },
  emailTemplates: {
    welcome: String,
    otp: String,
    applicationSubmitted: String,
    applicationApproved: String,
    applicationRejected: String
  },
  authentication: {
    method: {
      type: String,
      enum: ['otp', 'smtp', 'firebase', 'both'],
      default: 'smtp'
    },
    firebaseConfig: {
      apiKey: String,
      authDomain: String,
      projectId: String,
      storageBucket: String,
      messagingSenderId: String,
      appId: String
    }
  },
  termsAndConditions: String,
  privacyPolicy: String
}, {
  timestamps: true
});

export default mongoose.model('AdminSettings', adminSettingsSchema);

