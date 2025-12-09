import express from 'express';
import Application from '../models/Application.model.js';
import { protect } from '../middleware/auth.middleware.js';
import { uploadMultiple, uploadAny } from '../utils/upload.js';
import { sendEmail } from '../utils/sendEmail.js';
import mongoose from 'mongoose';
import Loan from '../models/Loan.model.js';

const router = express.Router();

// @route   POST /api/applications
// @desc    Create new loan application
// @access  Private
router.post('/', protect, uploadAny, async (req, res) => {
  try {
    // Organize files by field name
    const files = {};
    const dynamicFiles = {};
    
    if (req.files && Array.isArray(req.files)) {
      req.files.forEach(file => {
        if (file.fieldname.startsWith('dynamicFiles_')) {
          // Dynamic file field
          const fieldName = file.fieldname.replace('dynamicFiles_', '');
          if (!dynamicFiles[fieldName]) {
            dynamicFiles[fieldName] = [];
          }
          dynamicFiles[fieldName].push(file);
        } else {
          // Static document fields
          if (!files[file.fieldname]) {
            files[file.fieldname] = [];
          }
          files[file.fieldname].push(file);
        }
      });
    }
    
    const applicationData = req.body;

    // Parse JSON fields if they're strings
    ['personalInfo','address','employmentInfo','loanDetails','dynamicFields'].forEach(f => {
      if (typeof applicationData[f] === 'string') {
        try { applicationData[f] = JSON.parse(applicationData[f]); } catch { /* ignore */ }
      }
    });
    
    // Debug logging for loanDetails
    console.log('=== Application Creation Debug ===');
    console.log('loanDetails received:', JSON.stringify(applicationData.loanDetails, null, 2));
    console.log('loanDetails type:', typeof applicationData.loanDetails);

    // Accept loanId or loanProductId
    const loanId = applicationData.loanId || applicationData.loanProductId;
    if (!loanId || !mongoose.Types.ObjectId.isValid(loanId)) {
      return res.status(400).json({ success: false, message: 'Valid loanId required' });
    }

    const loan = await Loan.findById(loanId);
    if (!loan) {
      return res.status(404).json({ success: false, message: 'Loan not found' });
    }

    // Normalize loanDetails field names from frontend:
    // principal -> loanAmount, tenureMonths -> loanTenure
    const ld = applicationData.loanDetails || {};
    
    // Check if loanDetails is provided
    if (!ld || typeof ld !== 'object' || Object.keys(ld).length === 0) {
      console.error('loanDetails missing or empty:', ld);
      return res.status(400).json({ 
        success: false, 
        message: 'Loan details are required. Please provide loan amount and tenure.' 
      });
    }
    
    // Get loanAmount from either loanAmount or principal field
    const loanAmountRaw = ld.loanAmount ?? ld.principal;
    const loanTenureRaw = ld.loanTenure ?? ld.tenureMonths;
    
    // Check if fields are provided
    if (loanAmountRaw === undefined || loanAmountRaw === null || loanAmountRaw === '') {
      console.error('loanAmount is missing:', { loanAmount: ld.loanAmount, principal: ld.principal });
      return res.status(400).json({ 
        success: false, 
        message: 'Loan amount is required. Please enter a valid loan amount.' 
      });
    }
    
    if (loanTenureRaw === undefined || loanTenureRaw === null || loanTenureRaw === '') {
      console.error('loanTenure is missing:', { loanTenure: ld.loanTenure, tenureMonths: ld.tenureMonths });
      return res.status(400).json({ 
        success: false, 
        message: 'Loan tenure is required. Please enter a valid loan tenure in months.' 
      });
    }
    
    // Convert to numbers
    const loanAmount = Number(loanAmountRaw);
    const loanTenure = Number(loanTenureRaw);
    
    // Validate that they are valid numbers
    if (isNaN(loanAmount) || !Number.isFinite(loanAmount)) {
      console.error('loanAmount is not a valid number:', loanAmountRaw);
      return res.status(400).json({ 
        success: false, 
        message: `Loan amount must be a valid number. Received: ${loanAmountRaw}` 
      });
    }
    
    if (isNaN(loanTenure) || !Number.isFinite(loanTenure)) {
      console.error('loanTenure is not a valid number:', loanTenureRaw);
      return res.status(400).json({ 
        success: false, 
        message: `Loan tenure must be a valid number. Received: ${loanTenureRaw}` 
      });
    }
    
    // Validate that they are positive
    if (loanAmount <= 0) {
      console.error('loanAmount is not positive:', loanAmount);
      return res.status(400).json({ 
        success: false, 
        message: `Loan amount must be greater than 0. Received: ${loanAmount}` 
      });
    }
    
    if (loanTenure <= 0) {
      console.error('loanTenure is not positive:', loanTenure);
      return res.status(400).json({ 
        success: false, 
        message: `Loan tenure must be greater than 0 months. Received: ${loanTenure}` 
      });
    }

    const annualRate = loan.interestRate?.default ?? loan.interestRate?.min ?? 0;
    const monthlyRate = annualRate / 100 / 12;
    const emi = monthlyRate > 0
      ? Math.round(
          (loanAmount * monthlyRate * Math.pow(1 + monthlyRate, loanTenure)) /
          (Math.pow(1 + monthlyRate, loanTenure) - 1)
        )
      : 0;

    // Prepare documents array
    const documents = [];
    const pushGroup = (arr, type) => {
      (arr || []).forEach(file => {
        documents.push({
          type,
          name: file.originalname,
          url: `/uploads/${file.filename}`,
          status: 'Pending'
        });
      });
    };
    pushGroup(files.idProof, 'ID');
    pushGroup(files.addressProof, 'Address');
    pushGroup(files.incomeProof, 'Income');
    pushGroup(files.bankStatement, 'Bank Statement');
    pushGroup(files.otherDocuments, 'Other');
    // Handle selfie file (single file, not array)
    if (files.selfie && files.selfie.length > 0) {
      const selfieFile = files.selfie[0];
      documents.push({
        type: 'Selfie',
        name: selfieFile.originalname,
        url: `/uploads/${selfieFile.filename}`,
        status: 'Pending'
      });
    }

    // Handle dynamic fields
    const dynamicFields = applicationData.dynamicFields || {};
    
    // Process dynamic file fields and add to documents array
    Object.keys(dynamicFiles).forEach(fieldName => {
      const fieldFiles = dynamicFiles[fieldName];
      fieldFiles.forEach(file => {
        documents.push({
          type: `Dynamic: ${fieldName}`,
          name: file.originalname,
          url: `/uploads/${file.filename}`,
          status: 'Pending'
        });
      });
      // Store file URLs in dynamicFields
      if (!dynamicFields[fieldName]) {
        dynamicFields[fieldName] = [];
      }
      dynamicFields[fieldName] = fieldFiles.map(f => ({
        name: f.originalname,
        url: `/uploads/${f.filename}`
      }));
    });
    
    // Validate and prepare employmentInfo
    const employmentInfo = applicationData.employmentInfo || {};
    
    // Ensure employmentType is a valid string (not empty)
    if (!employmentInfo.employmentType || employmentInfo.employmentType.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Employment type is required. Please select your employment type.'
      });
    }
    
    // Ensure monthlyIncome is a valid number
    const monthlyIncome = Number(employmentInfo.monthlyIncome);
    if (!monthlyIncome || isNaN(monthlyIncome) || monthlyIncome <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Monthly income is required and must be a valid positive number.'
      });
    }
    
    // Prepare final employmentInfo object
    const finalEmploymentInfo = {
      employmentType: employmentInfo.employmentType.trim(),
      monthlyIncome: monthlyIncome,
      companyName: employmentInfo.companyName?.trim() || undefined,
      designation: employmentInfo.designation?.trim() || undefined,
      workExperience: employmentInfo.workExperience ? Number(employmentInfo.workExperience) : undefined,
      businessType: employmentInfo.businessType?.trim() || undefined,
      businessAge: employmentInfo.businessAge ? Number(employmentInfo.businessAge) : undefined
    };
    
    // Create application
    const application = await Application.create({
      userId: req.user._id,
      loanId: loan._id,
      loanType: loan.type,
      personalInfo: applicationData.personalInfo,
      address: applicationData.address,
      employmentInfo: finalEmploymentInfo,
      loanDetails: {
        loanAmount,
        loanTenure,
        interestRate: annualRate,
        emi
      },
      documents,
      dynamicFields: dynamicFields,
      status: 'Submitted'
    });

    // Send confirmation email (fix signature)
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width:600px;margin:0 auto;padding:20px;">
        <h2 style="color:#333;">Loan Application Submitted</h2>
        <p style="color:#666;">Dear ${applicationData.personalInfo?.fullName || 'Applicant'},</p>
        <p style="color:#666;">Your loan application has been submitted successfully.</p>
        <p style="color:#666;"><strong>Application Number:</strong> ${application.applicationNumber}</p>
        <p style="color:#666;"><strong>Loan Type:</strong> ${loan.type}</p>
        <p style="color:#666;"><strong>Loan Amount:</strong> ₹${loanAmount.toLocaleString()}</p>
        <p style="color:#666;">We will review your application and get back to you soon.</p>
      </div>`;
    await sendEmail({
      to: applicationData.personalInfo?.email,
      subject: 'Loan Application Submitted',
      html: emailHtml,
      text: 'Your loan application has been submitted.'
    });

    return res.status(201).json({
      success: true,
      message: 'Application submitted successfully',
      data: application
    });
  } catch (error) {
    console.error('=== Error in application creation ===');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const errors = {};
      Object.keys(error.errors || {}).forEach(key => {
        errors[key] = error.errors[key].message;
      });
      const errorMessages = Object.values(errors).join(', ');
      console.error('Validation errors:', errors);
      
      // Check specifically for loanAmount validation error
      if (error.errors && error.errors['loanDetails.loanAmount']) {
        return res.status(400).json({
          success: false,
          message: `Loan amount validation failed: ${error.errors['loanDetails.loanAmount'].message}`
        });
      }
      
      return res.status(400).json({
        success: false,
        message: `Validation failed: ${errorMessages}`
      });
    }
    
    // Handle other errors
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   GET /api/applications
// @desc    Get user's applications
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    let query = { userId: req.user._id };
    
    // If admin, get all applications
    if (req.user.role === 'admin') {
      query = {};
    }

    const applications = await Application.find(query)
      .populate('loanId', 'name type category')
      .populate({ path: 'loanId', populate: { path: 'category', select: 'name slug active' } })
      .populate('userId', 'name email phone')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: applications.length,
      data: applications
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   GET /api/applications/:id
// @desc    Get single application
// @access  Private
router.get('/:id', protect, async (req, res) => {
  try {
    const application = await Application.findById(req.params.id)
      .populate({ path: 'loanId', populate: { path: 'category', select: 'name slug active' } })
      .populate('userId', 'name email phone')
      .populate('approvedBy', 'name');

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    // Check if user has access
    if (req.user.role !== 'admin' && application.userId._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this application'
      });
    }

    res.json({
      success: true,
      data: application
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   PUT /api/applications/:id
// @desc    Update application
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    const application = await Application.findById(req.params.id);

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    // Only user can update their own draft application, or admin can update any
    if (req.user.role !== 'admin' && 
        (application.userId.toString() !== req.user._id.toString() || application.status !== 'Draft')) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this application'
      });
    }

    const updatedApplication = await Application.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      data: updatedApplication
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   POST /api/applications/:id/approve
// @desc    Approve application (Admin only)
// @access  Private/Admin
router.post('/:id/approve', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    const application = await Application.findById(req.params.id)
      .populate('userId');

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    application.status = 'Approved';
    application.approvedAt = new Date();
    application.approvedBy = req.user._id;
    await application.save();

    // Send approval email
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #28a745;">Loan Application Approved!</h2>
        <p style="color: #666;">Dear ${application.personalInfo.fullName},</p>
        <p style="color: #666;">Congratulations! Your loan application has been approved.</p>
        <p style="color: #666;"><strong>Application Number:</strong> ${application.applicationNumber}</p>
        <p style="color: #666;"><strong>Loan Amount:</strong> ₹${application.loanDetails.loanAmount.toLocaleString()}</p>
        <p style="color: #666;">Our team will contact you shortly to proceed with the disbursement.</p>
      </div>
    `;

    await sendEmail(
      application.userId.email,
      'Loan Application Approved',
      emailHtml
    );

    res.json({
      success: true,
      message: 'Application approved successfully',
      data: application
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   POST /api/applications/:id/reject
// @desc    Reject application (Admin only)
// @access  Private/Admin
router.post('/:id/reject', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized'
      });
    }

    const { rejectionReason } = req.body;
    const application = await Application.findById(req.params.id)
      .populate('userId');

    if (!application) {
      return res.status(404).json({
        success: false,
        message: 'Application not found'
      });
    }

    application.status = 'Rejected';
    application.rejectedAt = new Date();
    application.rejectionReason = rejectionReason || 'Application did not meet eligibility criteria';
    await application.save();

    // Send rejection email
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #dc3545;">Loan Application Status</h2>
        <p style="color: #666;">Dear ${application.personalInfo.fullName},</p>
        <p style="color: #666;">We regret to inform you that your loan application has been rejected.</p>
        <p style="color: #666;"><strong>Application Number:</strong> ${application.applicationNumber}</p>
        <p style="color: #666;"><strong>Reason:</strong> ${application.rejectionReason}</p>
        <p style="color: #666;">Please feel free to contact us if you have any questions.</p>
      </div>
    `;

    await sendEmail(
      application.userId.email,
      'Loan Application Status',
      emailHtml
    );

    res.json({
      success: true,
      message: 'Application rejected',
      data: application
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// Validation helper
function validateObjectId(id, field) {
  if (!id) throw new Error(`${field} is required`);
  if (id === '') throw new Error(`${field} cannot be empty string`);
  if (!mongoose.Types.ObjectId.isValid(id)) throw new Error(`${field} is not a valid ObjectId`);
  return id;
}

export default router;



