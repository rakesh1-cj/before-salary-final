import express from 'express';
import User from '../models/User.model.js';
import Loan from '../models/Loan.model.js';
import Application from '../models/Application.model.js';
import AdminSettings from '../models/AdminSettings.model.js';
import HomeLoanCard from '../models/HomeLoanCard.model.js';
import HomeInfoCard from '../models/HomeInfoCard.model.js';
import HomeBenefitCard from '../models/HomeBenefitCard.model.js';
import { protect, authorize } from '../middleware/auth.middleware.js';
import { uploadImage } from '../utils/upload.js';
import cloudinary from '../utils/cloudinary.js';
import fs from 'fs';

const router = express.Router();

// Public route for auth settings (needed for login page)
// @route   GET /api/admin/auth-settings
// @desc    Get authentication settings (public)
// @access  Public
router.get('/auth-settings', async (req, res) => {
  try {
    const settings = await AdminSettings.findOne();
    if (!settings || !settings.authentication) {
      return res.json({
        success: true,
        data: {
          method: 'smtp',
          firebaseConfig: null
        }
      });
    }

    res.json({
      success: true,
      data: settings.authentication
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// All other routes require admin access
router.use(protect);
router.use(authorize('admin'));

// @route   GET /api/admin/dashboard
// @desc    Get admin dashboard stats
// @access  Private/Admin
router.get('/dashboard', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments({ role: 'user' });
    const totalApplications = await Application.countDocuments();
    const pendingApplications = await Application.countDocuments({ status: { $in: ['Submitted', 'Under Review'] } });
    const approvedApplications = await Application.countDocuments({ status: 'Approved' });
    const rejectedApplications = await Application.countDocuments({ status: 'Rejected' });
    const totalLoans = await Loan.countDocuments({ isActive: true });

    // Recent applications
    const recentApplications = await Application.find()
      .populate('userId', 'name email phone')
      .populate('loanId', 'name type')
      .sort({ createdAt: -1 })
      .limit(10);

    // Loan statistics
    const loanStats = await Application.aggregate([
      {
        $group: {
          _id: '$loanType',
          count: { $sum: 1 },
          totalAmount: { $sum: '$loanDetails.loanAmount' }
        }
      }
    ]);

    res.json({
      success: true,
      data: {
        stats: {
          totalUsers,
          totalApplications,
          pendingApplications,
          approvedApplications,
          rejectedApplications,
          totalLoans
        },
        recentApplications,
        loanStats
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   GET /api/admin/users
// @desc    Get all users
// @access  Private/Admin
router.get('/users', async (req, res) => {
  try {
    const users = await User.find({ role: 'user' })
      .select('-password')
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      count: users.length,
      data: users
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   GET /api/admin/applications
// @desc    Get all applications
// @access  Private/Admin
router.get('/applications', async (req, res) => {
  try {
    const { status, loanType } = req.query;
    let query = {};

    if (status) {
      query.status = status;
    }
    if (loanType) {
      query.loanType = loanType;
    }

    const applications = await Application.find(query)
      .populate('userId', 'name email phone')
      .populate('loanId', 'name type')
      .populate('approvedBy', 'name')
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

// @route   GET /api/admin/settings
// @desc    Get admin settings
// @access  Private/Admin
router.get('/settings', async (req, res) => {
  try {
    // Always use the latest settings document
    let settings = await AdminSettings.findOne().sort({ createdAt: -1 });

    if (!settings) {
      // Create default settings if none exist
      settings = await AdminSettings.create({});
    }

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   POST /api/admin/upload-logo
// @desc    Upload logo image
// @access  Private/Admin
router.post('/upload-logo', uploadImage.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Decide whether to use Cloudinary or local storage based on env configuration
    const hasCloudinaryConfig =
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET;

    let logoUrl;
    let cloudinaryResult = null;

    if (hasCloudinaryConfig) {
      // Upload the image file from local disk (saved by multer) to Cloudinary
      cloudinaryResult = await cloudinary.uploader.upload(req.file.path, {
        folder: 'beforesalary/branding',
        resource_type: 'image'
      });

      logoUrl = cloudinaryResult.secure_url;

      // Remove the local file after successful upload
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupError) {
        // Log and ignore cleanup errors – they shouldn't block the response
        console.error('Error deleting local logo file:', cleanupError);
      }
    } else {
      // Fallback: use local uploads folder if Cloudinary is not configured
      logoUrl = `/uploads/${req.file.filename}`;
    }
    
    // Update settings with new logo (store Cloudinary URL)
    // Use the latest settings document to avoid stale records
    let settings = await AdminSettings.findOne().sort({ createdAt: -1 });
    if (!settings) {
      settings = await AdminSettings.create({ siteLogo: logoUrl });
    } else {
      settings.siteLogo = logoUrl;
      await settings.save();
    }

    res.json({
      success: true,
      message: 'Logo uploaded successfully',
      data: {
        logoUrl,
        publicId: cloudinaryResult ? cloudinaryResult.public_id : null
      }
    });
  } catch (error) {
    console.error('Error uploading logo:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to upload logo'
    });
  }
});

// @route   PUT /api/admin/settings
// @desc    Update admin settings
// @access  Private/Admin
router.put('/settings', async (req, res) => {
  try {
    // Always update the latest settings document
    let settings = await AdminSettings.findOne().sort({ createdAt: -1 });

    if (!settings) {
      settings = await AdminSettings.create(req.body);
    } else {
      settings = await AdminSettings.findByIdAndUpdate(
        settings._id,
        req.body,
        { new: true, runValidators: true }
      );
    }

    res.json({
      success: true,
      message: 'Settings updated successfully',
      data: settings
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   PUT /api/admin/users/:id
// @desc    Update user (activate/deactivate)
// @access  Private/Admin
router.put('/users/:id', async (req, res) => {
  try {
    const { isActive } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isActive },
      { new: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    res.json({
      success: true,
      message: `User ${isActive ? 'activated' : 'deactivated'} successfully`,
      data: user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   GET /api/admin/loans
// @desc    Get all loans (including inactive) for admin
// @access  Private/Admin
router.get('/loans', async (req, res) => {
  try {
    const loans = await Loan.find()
      .populate('category', 'name _id image')
      .sort({ order: 1, name: 1 });
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

// Navigation Management Routes
// @route   GET /api/admin/navigation
// @desc    Get navigation items
// @access  Private/Admin
router.get('/navigation', async (req, res) => {
  try {
    let settings = await AdminSettings.findOne();
    
    // Default navigation items
    const defaultNavigation = [
      { label: 'Home', path: '/', isPublic: true, isVisible: true, order: 1 },
      { label: 'About Us', path: '/about', isPublic: true, isVisible: true, order: 2 },
      { label: 'Loans', path: '/loans', isPublic: true, isVisible: true, order: 3 },
      { label: 'FAQs', path: '/faq', isPublic: true, isVisible: true, order: 4 },
      { label: 'Repay Loan', path: '/repay', isPublic: true, isVisible: true, order: 5 },
      { label: 'Contact Us', path: '/contact', isPublic: true, isVisible: true, order: 6 }
    ];
    
    if (!settings) {
      // Create settings with default navigation
      settings = await AdminSettings.create({ navigation: defaultNavigation });
      return res.json({
        success: true,
        data: defaultNavigation
      });
    }
    
    // If navigation is empty or doesn't exist, initialize with defaults
    if (!settings.navigation || settings.navigation.length === 0) {
      settings.navigation = defaultNavigation;
      await settings.save();
      return res.json({
        success: true,
        data: defaultNavigation
      });
    }
    
    res.json({
      success: true,
      data: settings.navigation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   POST /api/admin/navigation
// @desc    Add navigation item
// @access  Private/Admin
router.post('/navigation', async (req, res) => {
  try {
    let settings = await AdminSettings.findOne();
    if (!settings) {
      settings = await AdminSettings.create({});
    }
    
    if (!settings.navigation) {
      settings.navigation = [];
    }
    
    // Create new navigation item with proper structure
    const newItem = {
      label: req.body.label,
      path: req.body.path,
      icon: req.body.icon || '',
      order: req.body.order || settings.navigation.length + 1,
      isVisible: req.body.isVisible !== false,
      isPublic: req.body.isPublic !== false
    };
    
    settings.navigation.push(newItem);
    
    // Mark the navigation array as modified to ensure MongoDB saves it
    settings.markModified('navigation');
    await settings.save();
    
    // Return the newly created item with its _id
    const createdItem = settings.navigation[settings.navigation.length - 1];
    
    res.json({
      success: true,
      message: 'Navigation item added',
      data: createdItem
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   PUT /api/admin/navigation/:id
// @desc    Update navigation item
// @access  Private/Admin
router.put('/navigation/:id', async (req, res) => {
  try {
    const settings = await AdminSettings.findOne();
    if (!settings || !settings.navigation) {
      return res.status(404).json({
        success: false,
        message: 'Navigation not found'
      });
    }
    
    const itemIndex = settings.navigation.findIndex(item => item._id.toString() === req.params.id);
    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Navigation item not found'
      });
    }
    
    // Get the existing item and merge with updates, preserving all fields
    const existingItem = settings.navigation[itemIndex].toObject();
    const updatedItem = {
      ...existingItem,
      label: req.body.label !== undefined ? req.body.label : existingItem.label,
      path: req.body.path !== undefined ? req.body.path : existingItem.path,
      icon: req.body.icon !== undefined ? req.body.icon : existingItem.icon,
      order: req.body.order !== undefined ? req.body.order : existingItem.order,
      isVisible: req.body.isVisible !== undefined ? req.body.isVisible : existingItem.isVisible !== false,
      isPublic: req.body.isPublic !== undefined ? req.body.isPublic : existingItem.isPublic !== false
    };
    
    // Update the item in the array
    settings.navigation[itemIndex] = updatedItem;
    
    // Mark the navigation array as modified to ensure MongoDB saves it
    settings.markModified('navigation');
    await settings.save();
    
    res.json({
      success: true,
      message: 'Navigation item updated',
      data: settings.navigation[itemIndex]
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   DELETE /api/admin/navigation/:id
// @desc    Delete navigation item
// @access  Private/Admin
router.delete('/navigation/:id', async (req, res) => {
  try {
    const settings = await AdminSettings.findOne();
    if (!settings || !settings.navigation) {
      return res.status(404).json({
        success: false,
        message: 'Navigation not found'
      });
    }
    
    settings.navigation = settings.navigation.filter(item => item._id.toString() !== req.params.id);
    
    // Mark the navigation array as modified to ensure MongoDB saves it
    settings.markModified('navigation');
    await settings.save();
    
    res.json({
      success: true,
      message: 'Navigation item deleted',
      data: settings.navigation
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// ==================== Home Loan Cards Management ====================

// @route   GET /api/admin/home-loan-cards
// @desc    Get all home loan cards
// @access  Private/Admin
router.get('/home-loan-cards', async (req, res) => {
  try {
    const cards = await HomeLoanCard.find().sort({ order: 1, createdAt: 1 });
    res.json({
      success: true,
      data: cards
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   POST /api/admin/home-loan-cards
// @desc    Create a new home loan card
// @access  Private/Admin
router.post('/home-loan-cards', async (req, res) => {
  try {
    const { name, description, icon, link, order, isActive } = req.body;
    
    if (!name || !description) {
      return res.status(400).json({
        success: false,
        message: 'Name and description are required'
      });
    }

    const card = await HomeLoanCard.create({
      name,
      description,
      icon: icon || 'CurrencyDollarIcon',
      link: link || '/eligibility',
      order: order || 0,
      isActive: isActive !== undefined ? isActive : true
    });

    res.status(201).json({
      success: true,
      message: 'Home loan card created successfully',
      data: card
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   PUT /api/admin/home-loan-cards/:id
// @desc    Update a home loan card
// @access  Private/Admin
router.put('/home-loan-cards/:id', async (req, res) => {
  try {
    const { name, description, icon, link, order, isActive } = req.body;
    
    const card = await HomeLoanCard.findById(req.params.id);
    if (!card) {
      return res.status(404).json({
        success: false,
        message: 'Home loan card not found'
      });
    }

    if (name) card.name = name;
    if (description) card.description = description;
    if (icon) card.icon = icon;
    if (link) card.link = link;
    if (order !== undefined) card.order = order;
    if (isActive !== undefined) card.isActive = isActive;

    await card.save();

    res.json({
      success: true,
      message: 'Home loan card updated successfully',
      data: card
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   DELETE /api/admin/home-loan-cards/:id
// @desc    Delete a home loan card
// @access  Private/Admin
router.delete('/home-loan-cards/:id', async (req, res) => {
  try {
    const card = await HomeLoanCard.findByIdAndDelete(req.params.id);
    if (!card) {
      return res.status(404).json({
        success: false,
        message: 'Home loan card not found'
      });
    }

    res.json({
      success: true,
      message: 'Home loan card deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// ==================== Home Info Cards Management ====================

// @route   GET /api/admin/home-info-cards
router.get('/home-info-cards', async (req, res) => {
  try {
    const cards = await HomeInfoCard.find().sort({ order: 1, createdAt: 1 });
    res.json({ success: true, data: cards });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   POST /api/admin/home-info-cards
router.post('/home-info-cards', async (req, res) => {
  try {
    const { title, description, extraDescription, order, isActive } = req.body;
    if (!title || !description) {
      return res.status(400).json({ success: false, message: 'Title and description are required' });
    }

    const card = await HomeInfoCard.create({
      title,
      description,
      extraDescription,
      order: order ?? 0,
      isActive: isActive !== undefined ? isActive : true
    });

    res.status(201).json({ success: true, message: 'Home info card created', data: card });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   PUT /api/admin/home-info-cards/:id
router.put('/home-info-cards/:id', async (req, res) => {
  try {
    const card = await HomeInfoCard.findById(req.params.id);
    if (!card) {
      return res.status(404).json({ success: false, message: 'Home info card not found' });
    }

    const { title, description, extraDescription, order, isActive } = req.body;
    if (title !== undefined) card.title = title;
    if (description !== undefined) card.description = description;
    if (extraDescription !== undefined) card.extraDescription = extraDescription;
    if (order !== undefined) card.order = order;
    if (isActive !== undefined) card.isActive = isActive;

    await card.save();
    res.json({ success: true, message: 'Home info card updated', data: card });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   DELETE /api/admin/home-info-cards/:id
router.delete('/home-info-cards/:id', async (req, res) => {
  try {
    const card = await HomeInfoCard.findByIdAndDelete(req.params.id);
    if (!card) {
      return res.status(404).json({ success: false, message: 'Home info card not found' });
    }
    res.json({ success: true, message: 'Home info card deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// ==================== Home Benefit Cards Management ====================

router.get('/home-benefit-cards', async (req, res) => {
  try {
    const cards = await HomeBenefitCard.find().sort({ order: 1, createdAt: 1 });
    res.json({ success: true, data: cards });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

router.post('/home-benefit-cards', async (req, res) => {
  try {
    const { title, description, icon, order, isActive } = req.body;
    if (!title || !description) {
      return res.status(400).json({ success: false, message: 'Title and description are required' });
    }

    const card = await HomeBenefitCard.create({
      title,
      description,
      icon: icon || 'LightBulbIcon',
      order: order ?? 0,
      isActive: isActive !== undefined ? isActive : true
    });

    res.status(201).json({ success: true, message: 'Home benefit card created', data: card });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

router.put('/home-benefit-cards/:id', async (req, res) => {
  try {
    const card = await HomeBenefitCard.findById(req.params.id);
    if (!card) {
      return res.status(404).json({ success: false, message: 'Home benefit card not found' });
    }

    const { title, description, icon, order, isActive } = req.body;
    if (title !== undefined) card.title = title;
    if (description !== undefined) card.description = description;
    if (icon !== undefined) card.icon = icon;
    if (order !== undefined) card.order = order;
    if (isActive !== undefined) card.isActive = isActive;

    await card.save();
    res.json({ success: true, message: 'Home benefit card updated', data: card });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

router.delete('/home-benefit-cards/:id', async (req, res) => {
  try {
    const card = await HomeBenefitCard.findByIdAndDelete(req.params.id);
    if (!card) {
      return res.status(404).json({ success: false, message: 'Home benefit card not found' });
    }
    res.json({ success: true, message: 'Home benefit card deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

export default router;

