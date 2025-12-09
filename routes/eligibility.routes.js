import express from 'express';
import Eligibility from '../models/Eligibility.model.js';
import { protect, authorize } from '../middleware/auth.middleware.js';

const router = express.Router();

// IMPORTANT: Define specific routes (like /user) before parameterized routes (like /:id)
// to avoid route matching conflicts

// @route   GET /api/eligibility/my-status
// @desc    Get user's eligibility checks
// @access  Private
router.get('/my-status', protect, async (req, res) => {
  try {
    // Check if user exists after protect middleware
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const userEmail = req.user.email?.toLowerCase().trim() || '';
    const userName = req.user.name?.trim() || '';
    
    console.log('=== Fetching eligibility for user ===');
    console.log('User email:', userEmail);
    console.log('User name:', userName);
    console.log('User ID:', req.user._id);
    
    // Simple and reliable search - match by email OR name
    const searchConditions = [];
    
    // Email matching (exact match)
    if (userEmail) {
      searchConditions.push({ email: userEmail });
      searchConditions.push({ personalEmail: userEmail });
    }
    
    // Name matching (case insensitive, partial match)
    if (userName && userName.length > 2) {
      const escapedName = userName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      searchConditions.push({
        name: { $regex: escapedName, $options: 'i' }
      });
    }
    
    console.log(`Searching with ${searchConditions.length} conditions...`);
    
    // Find eligibilities
    let eligibilities = [];
    if (searchConditions.length > 0) {
      eligibilities = await Eligibility.find({ 
        $or: searchConditions
      })
        .populate('loanId', 'name type slug _id')
        .sort({ createdAt: -1 });
    }

    console.log('Found eligibilities:', eligibilities.length);
    
    // Log detailed information for debugging
    eligibilities.forEach((elig, idx) => {
      console.log(`  Eligibility ${idx + 1}:`, {
        id: elig._id,
        name: elig.name,
        loanId: elig.loanId?._id || elig.loanId,
        loanName: elig.loanId?.name,
        status: elig.status,
        email: elig.email,
        personalEmail: elig.personalEmail,
        netMonthlyIncome: elig.netMonthlyIncome,
        employmentType: elig.employmentType,
        createdAt: elig.createdAt,
        updatedAt: elig.updatedAt
      });
    });
    
    // If no eligibilities found, log potential reasons
    if (eligibilities.length === 0) {
      console.log('⚠️ No eligibility records found for user.');
      console.log('  - Searched for email:', userEmail);
      console.log('  - Searched for name:', userName);
      console.log('  - Total search conditions:', searchConditions.length);
      
      // Let's also check if there are ANY eligibility records in the database
      const totalEligibilities = await Eligibility.countDocuments();
      console.log('  - Total eligibility records in database:', totalEligibilities);
      
      if (totalEligibilities > 0) {
        // Get a sample to see what emails/names exist
        const sample = await Eligibility.find({}).limit(3).select('name email personalEmail');
        console.log('  - Sample eligibility records:');
        sample.forEach((s, i) => {
          console.log(`    ${i + 1}. Name: "${s.name}", Email: "${s.email}", PersonalEmail: "${s.personalEmail}"`);
        });
      }
    }
    
    // Convert Mongoose documents to plain objects and ensure all fields are included
    const eligibilitiesWithStatus = eligibilities.map(elig => {
      const eligObj = elig.toObject ? elig.toObject() : elig;
      return {
        _id: eligObj._id,
        name: eligObj.name,
        email: eligObj.email,
        personalEmail: eligObj.personalEmail,
        pancard: eligObj.pancard,
        dob: eligObj.dob,
        gender: eligObj.gender,
        loanId: eligObj.loanId,
        employmentType: eligObj.employmentType,
        companyName: eligObj.companyName,
        nextSalaryDate: eligObj.nextSalaryDate,
        netMonthlyIncome: eligObj.netMonthlyIncome,
        pinCode: eligObj.pinCode,
        state: eligObj.state,
        city: eligObj.city,
        status: eligObj.status || 'pending',
        rejectionReason: eligObj.rejectionReason,
        createdAt: eligObj.createdAt,
        updatedAt: eligObj.updatedAt
      };
    });

    // Log final response
    console.log(`Returning ${eligibilitiesWithStatus.length} eligibility records to client`);
    
    res.json({
      success: true,
      data: eligibilitiesWithStatus,
      count: eligibilitiesWithStatus.length,
      message: eligibilitiesWithStatus.length > 0 
        ? `Found ${eligibilitiesWithStatus.length} eligibility record(s)` 
        : 'No eligibility records found'
    });
  } catch (error) {
    console.error('Error fetching user eligibility:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   POST /api/eligibility
// @desc    Submit eligibility check form
// @access  Public
router.post('/', async (req, res) => {
  try {
    const {
      name,
      email,
      loanId,
      pancard,
      dob,
      gender,
      personalEmail,
      employmentType,
      companyName,
      nextSalaryDate,
      netMonthlyIncome,
      pinCode,
      state,
      city
    } = req.body;

    // Validate required fields
    if (!name || !email || !pancard || !dob || !gender || !personalEmail || !employmentType || !netMonthlyIncome || !pinCode) {
      return res.status(400).json({
        success: false,
        message: 'Please fill all required fields'
      });
    }

    // Validate employment type specific fields
    if (employmentType === 'SALARIED' && (!companyName || !nextSalaryDate)) {
      return res.status(400).json({
        success: false,
        message: 'Company name and next salary date are required for salaried employees'
      });
    }

    // Create eligibility record
    const eligibility = await Eligibility.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      loanId: loanId || null,
      pancard: pancard.toUpperCase().trim(),
      dob: new Date(dob),
      gender,
      personalEmail: personalEmail.toLowerCase().trim(),
      employmentType,
      companyName: companyName?.trim() || null,
      nextSalaryDate: nextSalaryDate ? new Date(nextSalaryDate) : null,
      netMonthlyIncome: Number(netMonthlyIncome),
      pinCode: pinCode.trim(),
      state: state?.trim() || null,
      city: city?.trim() || null,
      status: 'pending'
    });

    res.status(201).json({
      success: true,
      message: 'Eligibility check submitted successfully',
      data: eligibility
    });
  } catch (error) {
    console.error('Error submitting eligibility:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   GET /api/eligibility
// @desc    Get all eligibility checks (admin only)
// @access  Private/Admin
router.get('/', protect, authorize('admin'), async (req, res) => {
  try {
    const { page = 1, limit = 10, email, loanId } = req.query;
    const query = {};

    if (email) {
      query.email = email.toLowerCase().trim();
    }
    if (loanId) {
      query.loanId = loanId;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const eligibilities = await Eligibility.find(query)
      .populate('loanId', 'name slug')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Eligibility.countDocuments(query);

    res.json({
      success: true,
      data: eligibilities,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   PUT /api/eligibility/:id/approve
// @desc    Approve eligibility check
// @access  Private/Admin
// NOTE: This must come before /:id route to avoid route conflicts
router.put('/:id/approve', protect, authorize('admin'), async (req, res) => {
  try {
    const eligibilityId = req.params.id;
    console.log('=== Approving eligibility ===');
    console.log('Eligibility ID:', eligibilityId);
    console.log('Approved by:', req.user.email, req.user.name);
    
    // Find and update eligibility
    const eligibility = await Eligibility.findByIdAndUpdate(
      eligibilityId,
      { 
        status: 'approved',
        updatedAt: new Date()
      },
      { 
        new: true,
        runValidators: true
      }
    ).populate('loanId', 'name slug');

    if (!eligibility) {
      console.error('Eligibility not found:', eligibilityId);
      return res.status(404).json({
        success: false,
        message: 'Eligibility check not found'
      });
    }

    console.log('Eligibility approved successfully:', {
      id: eligibility._id,
      name: eligibility.name,
      status: eligibility.status,
      email: eligibility.email
    });

    res.json({
      success: true,
      message: 'Eligibility approved successfully',
      data: eligibility
    });
  } catch (error) {
    console.error('Error approving eligibility:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   PUT /api/eligibility/:id/reject
// @desc    Reject eligibility check
// @access  Private/Admin
// NOTE: This must come before /:id route to avoid route conflicts
router.put('/:id/reject', protect, authorize('admin'), async (req, res) => {
  try {
    const { rejectionReason } = req.body;
    const eligibilityId = req.params.id;
    
    console.log('=== Rejecting eligibility ===');
    console.log('Eligibility ID:', eligibilityId);
    console.log('Rejection reason:', rejectionReason);
    console.log('Rejected by:', req.user.email, req.user.name);
    
    const eligibility = await Eligibility.findByIdAndUpdate(
      eligibilityId,
      { 
        status: 'rejected',
        rejectionReason: rejectionReason || null,
        updatedAt: new Date()
      },
      { 
        new: true,
        runValidators: true
      }
    ).populate('loanId', 'name slug');

    if (!eligibility) {
      return res.status(404).json({
        success: false,
        message: 'Eligibility check not found'
      });
    }

    res.json({
      success: true,
      message: 'Eligibility rejected successfully',
      data: eligibility
    });
  } catch (error) {
    console.error('Error rejecting eligibility:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   GET /api/eligibility/:id
// @desc    Get single eligibility check
// @access  Private/Admin
// NOTE: This must come after specific routes like /approve and /reject
router.get('/:id', protect, authorize('admin'), async (req, res) => {
  try {
    const eligibility = await Eligibility.findById(req.params.id)
      .populate('loanId', 'name slug');

    if (!eligibility) {
      return res.status(404).json({
        success: false,
        message: 'Eligibility check not found'
      });
    }

    res.json({
      success: true,
      data: eligibility
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

export default router;

