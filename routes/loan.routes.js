import express from 'express';
import Loan from '../models/Loan.model.js';
import { protect } from '../middleware/auth.middleware.js';
import { upload } from '../utils/upload.js';
import multer from 'multer';

const router = express.Router();

// Wrapper to handle multer errors properly
const uploadWithErrorHandling = (uploadMiddleware) => {
  return (req, res, next) => {
    uploadMiddleware(req, res, (err) => {
      if (err) {
        console.error('Multer error:', err);
        if (err instanceof multer.MulterError) {
          return res.status(400).json({ 
            success: false, 
            message: `File upload error: ${err.message}` 
          });
        } else {
          return res.status(400).json({ 
            success: false, 
            message: err.message || 'File upload failed' 
          });
        }
      }
      next();
    });
  };
};

// @route   GET /api/loans
// @desc    Get all active loans
// @access  Public
router.get('/', async (req, res) => {
  try {
    const loans = await Loan.find({ isActive: true })
      .populate('category', 'name _id image')
      .sort({ order: 1 });
    res.json({
      success: true,
      count: loans.length,
      data: loans
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   GET /api/loans/:slug
// @desc    Get loan by slug
// @access  Public
router.get('/:slug', async (req, res) => {
  try {
    const loan = await Loan.findOne({ slug: req.params.slug, isActive: true })
      .populate('category', 'name _id image');
    
    if (!loan) {
      return res.status(404).json({
        success: false,
        message: 'Loan not found'
      });
    }

    res.json({
      success: true,
      data: loan
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   GET /api/loans/type/:type
// @desc    Get loans by type
// @access  Public
router.get('/type/:type', async (req, res) => {
  try {
    const loans = await Loan.find({ 
      type: req.params.type, 
      isActive: true 
    }).sort({ order: 1 });

    res.json({
      success: true,
      count: loans.length,
      data: loans
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// Admin routes below - require authentication and admin role
// @route   POST /api/loans
// @desc    Create new loan
// @access  Private/Admin
// upload.any() handles FormData with or without files
router.post('/', protect, uploadWithErrorHandling(upload.any()), async (req, res) => {
  try {
    // Verify user is authenticated
    if (!req.user) {
      console.error('ERROR: req.user is undefined!');
      return res.status(401).json({
        success: false,
        message: 'Not authenticated. Please login again.'
      });
    }

    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to create loans'
      });
    }

    console.log('=== Loan Creation Request ===');
    console.log('Request body:', req.body);
    console.log('Request body keys:', Object.keys(req.body));
    console.log('Request body values:', {
      name: req.body.name,
      slug: req.body.slug,
      type: req.body.type,
      description: req.body.description ? 'present' : 'missing',
      interestRate: req.body.interestRate,
      minLoanAmount: req.body.minLoanAmount,
      maxLoanAmount: req.body.maxLoanAmount,
      minTenure: req.body.minTenure,
      maxTenure: req.body.maxTenure
    });
    console.log('User ID:', req.user._id);
    console.log('Request headers content-type:', req.headers['content-type']);

    // Handle file upload - check both req.file (single) and req.files (any)
    let fileUrl = null;
    console.log('File upload check - req.files:', req.files ? req.files.length : 'none', 'req.file:', req.file ? req.file.filename : 'none');
    if (req.files && req.files.length > 0) {
      console.log('Available files:', req.files.map(f => ({ fieldname: f.fieldname, filename: f.filename })));
      const uploadedFile = req.files.find(f => f.fieldname === 'file');
      if (uploadedFile) {
        fileUrl = `/uploads/${uploadedFile.filename}`;
        console.log('✅ File uploaded for loan:', uploadedFile.filename, 'URL:', fileUrl);
      } else {
        console.log('⚠️ No file with fieldname "file" found. Available fieldnames:', req.files.map(f => f.fieldname));
      }
    }
    if (!fileUrl) {
      fileUrl = req.body.image || '';
      console.log('No file uploaded, using image from body or empty:', fileUrl || 'EMPTY');
    }

    // Prepare loan data - start with req.body
    // Multer parses FormData and puts fields in req.body
    const loanData = {
      ...req.body,
      image: fileUrl || req.body.image || '',
      user: req.user._id // Add user ID from authenticated user
    };
    
    console.log('File URL set to:', fileUrl);
    console.log('Loan data image field:', loanData.image);

    console.log('Parsed loanData before processing:', {
      name: loanData.name,
      type: loanData.type,
      description: loanData.description ? 'present' : 'missing',
      slug: loanData.slug,
      interestRate: loanData.interestRate,
      minLoanAmount: loanData.minLoanAmount,
      maxLoanAmount: loanData.maxLoanAmount,
      minTenure: loanData.minTenure,
      maxTenure: loanData.maxTenure,
      user: loanData.user
    });

    // If req.body is empty or has no fields, it means FormData wasn't parsed correctly
    if (Object.keys(req.body).length === 0) {
      console.error('ERROR: req.body is empty! FormData might not be parsed correctly.');
      console.error('Full req.body:', JSON.stringify(req.body, null, 2));
      console.error('Request method:', req.method);
      console.error('Content-Type:', req.headers['content-type']);
      return res.status(400).json({
        success: false,
        message: 'Request body is empty. FormData was not parsed correctly. Please check the request format.'
      });
    }

    // Check if required fields are missing
    if (!loanData.name || !loanData.type || !loanData.description) {
      console.error('ERROR: Required fields are missing!');
      console.error('Missing fields:', {
        name: !loanData.name,
        type: !loanData.type,
        description: !loanData.description,
        slug: !loanData.slug
      });
      return res.status(400).json({
        success: false,
        message: `Missing required fields: ${!loanData.name ? 'name ' : ''}${!loanData.type ? 'type ' : ''}${!loanData.description ? 'description ' : ''}${!loanData.slug ? 'slug ' : ''}`
      });
    }

    // Parse nested objects if they're strings (from FormData)
    if (typeof loanData.interestRate === 'string') {
      try {
        loanData.interestRate = JSON.parse(loanData.interestRate);
      } catch (e) {
        console.error('Error parsing interestRate:', e);
        // If parsing fails, create default structure
        loanData.interestRate = { min: 0, max: 0, default: 0 };
      }
    }

    // Convert string numbers to actual numbers (FormData sends everything as strings)
    if (typeof loanData.minLoanAmount === 'string') {
      loanData.minLoanAmount = Number(loanData.minLoanAmount) || 0;
    }
    if (typeof loanData.maxLoanAmount === 'string') {
      loanData.maxLoanAmount = Number(loanData.maxLoanAmount) || 0;
    }
    if (typeof loanData.minTenure === 'string') {
      loanData.minTenure = Number(loanData.minTenure) || 0;
    }
    if (typeof loanData.maxTenure === 'string') {
      loanData.maxTenure = Number(loanData.maxTenure) || 0;
    }
    if (typeof loanData.order === 'string') {
      loanData.order = Number(loanData.order) || 0;
    }
    if (typeof loanData.isActive === 'string') {
      loanData.isActive = loanData.isActive === 'true';
    }

    // Ensure interestRate object has all required fields
    if (!loanData.interestRate || typeof loanData.interestRate !== 'object') {
      loanData.interestRate = { min: 0, max: 0, default: 0 };
    }
    if (typeof loanData.interestRate.min === 'string') {
      loanData.interestRate.min = Number(loanData.interestRate.min) || 0;
    }
    if (typeof loanData.interestRate.max === 'string') {
      loanData.interestRate.max = Number(loanData.interestRate.max) || 0;
    }
    if (typeof loanData.interestRate.default === 'string') {
      loanData.interestRate.default = Number(loanData.interestRate.default) || 0;
    }

    // Ensure slug is generated if not provided
    if (!loanData.slug && loanData.name) {
      loanData.slug = loanData.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }

    // Validate required fields before creating
    if (!loanData.name || !loanData.name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Loan name is required'
      });
    }
    if (!loanData.type || !loanData.type.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Loan type is required'
      });
    }
    if (!loanData.description || !loanData.description.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Loan description is required'
      });
    }
    if (!loanData.slug || !loanData.slug.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Loan slug is required'
      });
    }

    // Ensure numeric fields are valid numbers (not 0 or undefined)
    if (!loanData.minLoanAmount || loanData.minLoanAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Min loan amount must be greater than 0'
      });
    }
    if (!loanData.maxLoanAmount || loanData.maxLoanAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Max loan amount must be greater than 0'
      });
    }
    if (!loanData.minTenure || loanData.minTenure <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Min tenure must be greater than 0'
      });
    }
    if (!loanData.maxTenure || loanData.maxTenure <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Max tenure must be greater than 0'
      });
    }

    // Validate interestRate object
    if (!loanData.interestRate || typeof loanData.interestRate !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Interest rate is required'
      });
    }
    if (loanData.interestRate.min === undefined || loanData.interestRate.min === null) {
      return res.status(400).json({
        success: false,
        message: 'Min interest rate is required'
      });
    }
    if (loanData.interestRate.max === undefined || loanData.interestRate.max === null) {
      return res.status(400).json({
        success: false,
        message: 'Max interest rate is required'
      });
    }
    if (loanData.interestRate.default === undefined || loanData.interestRate.default === null) {
      return res.status(400).json({
        success: false,
        message: 'Default interest rate is required'
      });
    }

    // Set defaults for optional fields
    loanData.order = loanData.order ?? 0;
    loanData.isActive = loanData.isActive !== false;

    // Final validation - ensure all required fields are present and valid
    // Ensure interestRate is an object with all required fields
    if (!loanData.interestRate || typeof loanData.interestRate !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Interest rate object is missing or invalid'
      });
    }

    const finalLoanData = {
      name: (loanData.name || '').trim(),
      slug: (loanData.slug || '').trim(),
      type: (loanData.type || '').trim(),
      description: (loanData.description || '').trim(),
      interestRate: {
        min: Number(loanData.interestRate.min) || 0,
        max: Number(loanData.interestRate.max) || 0,
        default: Number(loanData.interestRate.default) || 0
      },
      minLoanAmount: Number(loanData.minLoanAmount) || 0,
      maxLoanAmount: Number(loanData.maxLoanAmount) || 0,
      minTenure: Number(loanData.minTenure) || 0,
      maxTenure: Number(loanData.maxTenure) || 0,
      user: loanData.user || req.user._id, // Fallback to req.user._id
      image: fileUrl || '',
      isActive: loanData.isActive !== false,
      order: Number(loanData.order) || 0
    };
    
    // Add category if provided
    if (loanData.category) {
      finalLoanData.category = loanData.category;
    }

    // Final check - ensure no undefined or null values for required fields
    if (!finalLoanData.name || !finalLoanData.slug || !finalLoanData.type || !finalLoanData.description) {
      return res.status(400).json({
        success: false,
        message: 'All text fields (name, slug, type, description) are required'
      });
    }
    if (!finalLoanData.user) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required. Please ensure you are authenticated.'
      });
    }

    console.log('Creating loan with final data:', {
      name: finalLoanData.name,
      slug: finalLoanData.slug,
      type: finalLoanData.type,
      user: finalLoanData.user,
      interestRate: finalLoanData.interestRate,
      minLoanAmount: finalLoanData.minLoanAmount,
      maxLoanAmount: finalLoanData.maxLoanAmount,
      minTenure: finalLoanData.minTenure,
      maxTenure: finalLoanData.maxTenure,
      description: finalLoanData.description ? 'present' : 'missing',
      image: finalLoanData.image || 'NO IMAGE',
      hasUser: !!finalLoanData.user
    });

    const loan = await Loan.create(finalLoanData);
    res.status(201).json({
      success: true,
      data: loan
    });
  } catch (error) {
    console.error('=== Error creating loan ===');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    if (error.errors) {
      console.error('Validation errors:', Object.keys(error.errors));
      Object.keys(error.errors).forEach(key => {
        console.error(`  ${key}:`, error.errors[key].message);
      });
    }
    
    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const errors = Object.values(error.errors).map(err => `${err.path}: ${err.message}`).join(', ');
      return res.status(400).json({
        success: false,
        message: `Loan validation failed: ${errors}`
      });
    }
    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        success: false,
        message: `${field} already exists`
      });
    }
    // Generic error response
    res.status(500).json({
      success: false,
      message: error.message || 'Server error',
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
  }
});

// @route   PUT /api/loans/:id
// @desc    Update loan
// @access  Private/Admin
router.put('/:id', protect, uploadWithErrorHandling(upload.single('file')), async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update loans'
      });
    }

    // Get existing loan to preserve image if no new file is uploaded
    const existingLoan = await Loan.findById(req.params.id);
    if (!existingLoan) {
      return res.status(404).json({
        success: false,
        message: 'Loan not found'
      });
    }

    // Handle file upload
    let fileUrl = null;
    if (req.file) {
      fileUrl = `/uploads/${req.file.filename}`;
      console.log('File uploaded for loan update:', req.file.filename);
    }

    // Prepare loan data
    const loanData = { ...req.body };
    // Set image: use new file if uploaded, otherwise preserve existing, or use from body if provided
    if (fileUrl) {
      loanData.image = fileUrl;
    } else if (req.body.image !== undefined) {
      loanData.image = req.body.image;
    } else {
      // Preserve existing image if no new file and no image in body
      loanData.image = existingLoan.image || '';
    }

    // Parse nested objects if they're strings (from FormData)
    if (typeof loanData.interestRate === 'string') {
      try {
        loanData.interestRate = JSON.parse(loanData.interestRate);
      } catch (e) {
        // If parsing fails, keep existing or create default
        if (!loanData.interestRate) {
          loanData.interestRate = { min: 0, max: 0, default: 0 };
        }
      }
    }

    // Convert string numbers to actual numbers (FormData sends everything as strings)
    if (typeof loanData.minLoanAmount === 'string') {
      loanData.minLoanAmount = Number(loanData.minLoanAmount);
    }
    if (typeof loanData.maxLoanAmount === 'string') {
      loanData.maxLoanAmount = Number(loanData.maxLoanAmount);
    }
    if (typeof loanData.minTenure === 'string') {
      loanData.minTenure = Number(loanData.minTenure);
    }
    if (typeof loanData.maxTenure === 'string') {
      loanData.maxTenure = Number(loanData.maxTenure);
    }
    if (typeof loanData.order === 'string') {
      loanData.order = Number(loanData.order);
    }
    if (typeof loanData.isActive === 'string') {
      loanData.isActive = loanData.isActive === 'true';
    }

    // Ensure interestRate object has all required fields
    if (loanData.interestRate && typeof loanData.interestRate === 'object') {
      if (typeof loanData.interestRate.min === 'string') {
        loanData.interestRate.min = Number(loanData.interestRate.min);
      }
      if (typeof loanData.interestRate.max === 'string') {
        loanData.interestRate.max = Number(loanData.interestRate.max);
      }
      if (typeof loanData.interestRate.default === 'string') {
        loanData.interestRate.default = Number(loanData.interestRate.default);
      }
    }

    const loan = await Loan.findByIdAndUpdate(
      req.params.id,
      loanData,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      data: loan
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   DELETE /api/loans/:id
// @desc    Delete loan
// @access  Private/Admin
router.delete('/:id', protect, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete loans'
      });
    }

    const loan = await Loan.findByIdAndDelete(req.params.id);

    if (!loan) {
      return res.status(404).json({
        success: false,
        message: 'Loan not found'
      });
    }

    res.json({
      success: true,
      message: 'Loan deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

export default router;



