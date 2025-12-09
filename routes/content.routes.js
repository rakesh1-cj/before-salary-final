import express from 'express';
import { Content, FAQ, Blog } from '../models/Content.model.js';
import { protect, authorize } from '../middleware/auth.middleware.js';

const router = express.Router();

// Public routes
// @route   GET /api/content/navigation
// @desc    Get navigation menu (public)
// @access  Public
router.get('/navigation', async (req, res) => {
  try {
    const AdminSettings = (await import('../models/AdminSettings.model.js')).default;
    // Always use the latest settings document in case multiple exist
    const settings = await AdminSettings.findOne().sort({ createdAt: -1 });
    
    // Default navigation items
    const defaultNavigation = [
      { label: 'Home', path: '/', isPublic: true, isVisible: true },
      { label: 'About Us', path: '/about', isPublic: true, isVisible: true },
      { label: 'Loans', path: '/loans', isPublic: true, isVisible: true },
      { label: 'FAQs', path: '/faq', isPublic: true, isVisible: true },
      { label: 'Repay Loan', path: '/repay', isPublic: true, isVisible: true },
      { label: 'Contact Us', path: '/contact', isPublic: true, isVisible: true }
    ];

    if (!settings) {
      // Return default values if no settings exist
      return res.json({
        success: true,
        data: {
          siteName: 'BeforeSalary',
          siteTagline: 'For Brighter Tomorrow',
          siteLogo: '',
          navigation: defaultNavigation
        }
      });
    }

    // Get navigation items - use settings navigation if available, otherwise use defaults
    let navigation = defaultNavigation;
    if (settings.navigation && Array.isArray(settings.navigation) && settings.navigation.length > 0) {
      // Filter visible items and sort by order
      // Only show items that are explicitly set to visible (isVisible !== false)
      const visibleItems = settings.navigation
        .filter(item => {
          // Show item if isVisible is true or undefined (default to visible)
          return item.isVisible !== false;
        })
        .sort((a, b) => (a.order || 0) - (b.order || 0));
      
      // Use visible items if we have any, otherwise fall back to defaults
      // This ensures that if admin hides all items, we still show defaults
      navigation = visibleItems.length > 0 ? visibleItems : defaultNavigation;
    }

    // Always return logo and branding from settings, even if navigation is empty
    res.json({
      success: true,
      data: {
        siteName: settings.siteName || 'BeforeSalary',
        siteTagline: settings.siteTagline || 'For Brighter Tomorrow',
        siteLogo: settings.siteLogo || '',
        navigation: navigation
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   GET /api/content/hero-banner
// @desc    Get hero banner (public)
// @access  Public
router.get('/hero-banner', async (req, res) => {
  try {
    const AdminSettings = (await import('../models/AdminSettings.model.js')).default;
    const settings = await AdminSettings.findOne();
    
    if (!settings || !settings.heroBanner || !settings.heroBanner.isActive) {
      return res.json({
        success: true,
        data: {
          title: 'Get an instant personal loan in minutes',
          subtitle: 'BeforeSalary makes borrowing easy with fast approvals, fair terms, and convenient repayment plans',
          ctaText: 'Start Now',
          image: '',
          isActive: true
        }
      });
    }

    res.json({
      success: true,
      data: settings.heroBanner
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   GET /api/content/:page
// @desc    Get content by page
// @access  Public
router.get('/:page', async (req, res) => {
  try {
    // Skip if it's a special route
    if (['hero-banner', 'faq', 'blog', 'navigation'].includes(req.params.page)) {
      return res.status(404).json({
        success: false,
        message: 'Route not found'
      });
    }

    const contents = await Content.find({
      page: req.params.page,
      isActive: true
    }).sort({ order: 1 });

    // Always return success, even if array is empty
    res.json({
      success: true,
      data: contents || []
    });
  } catch (error) {
    console.error('Error fetching content:', error);
    // Return success with empty array on error to prevent frontend crashes
    res.json({
      success: true,
      data: []
    });
  }
});

// @route   GET /api/content/faq
// @desc    Get all FAQs
// @access  Public
router.get('/faq/all', async (req, res) => {
  try {
    const { category } = req.query;
    let query = { isActive: true };
    
    if (category) {
      query.category = category;
    }

    const faqs = await FAQ.find(query).sort({ order: 1 });

    res.json({
      success: true,
      count: faqs.length,
      data: faqs
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   GET /api/content/blog
// @desc    Get all published blog posts
// @access  Public
router.get('/blog/all', async (req, res) => {
  try {
    const blogs = await Blog.find({ isPublished: true })
      .sort({ publishedAt: -1 })
      .limit(20);

    res.json({
      success: true,
      count: blogs.length,
      data: blogs
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   GET /api/content/blog/:slug
// @desc    Get single blog post
// @access  Public
router.get('/blog/:slug', async (req, res) => {
  try {
    const blog = await Blog.findOne({
      slug: req.params.slug,
      isPublished: true
    });

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found'
      });
    }

    // Increment views
    blog.views += 1;
    await blog.save();

    res.json({
      success: true,
      data: blog
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// Admin routes - require authentication and admin role
router.use(protect);
router.use(authorize('admin'));

// Content management
// @route   POST /api/content
// @desc    Create content
// @access  Private/Admin
router.post('/', async (req, res) => {
  try {
    const content = await Content.create(req.body);
    res.status(201).json({
      success: true,
      data: content
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   PUT /api/content/:id
// @desc    Update content
// @access  Private/Admin
router.put('/:id', async (req, res) => {
  try {
    const content = await Content.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!content) {
      return res.status(404).json({
        success: false,
        message: 'Content not found'
      });
    }

    res.json({
      success: true,
      data: content
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// FAQ management
// @route   POST /api/content/faq
// @desc    Create FAQ
// @access  Private/Admin
router.post('/faq', async (req, res) => {
  try {
    const faq = await FAQ.create(req.body);
    res.status(201).json({
      success: true,
      data: faq
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   PUT /api/content/faq/:id
// @desc    Update FAQ
// @access  Private/Admin
router.put('/faq/:id', async (req, res) => {
  try {
    const faq = await FAQ.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!faq) {
      return res.status(404).json({
        success: false,
        message: 'FAQ not found'
      });
    }

    res.json({
      success: true,
      data: faq
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   DELETE /api/content/faq/:id
// @desc    Delete FAQ
// @access  Private/Admin
router.delete('/faq/:id', async (req, res) => {
  try {
    const faq = await FAQ.findByIdAndDelete(req.params.id);

    if (!faq) {
      return res.status(404).json({
        success: false,
        message: 'FAQ not found'
      });
    }

    res.json({
      success: true,
      message: 'FAQ deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// Blog management
// @route   POST /api/content/blog
// @desc    Create blog post
// @access  Private/Admin
router.post('/blog', async (req, res) => {
  try {
    const blog = await Blog.create({
      ...req.body,
      publishedAt: req.body.isPublished ? new Date() : null
    });
    res.status(201).json({
      success: true,
      data: blog
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   PUT /api/content/blog/:id
// @desc    Update blog post
// @access  Private/Admin
router.put('/blog/:id', async (req, res) => {
  try {
    const blog = await Blog.findById(req.params.id);
    
    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found'
      });
    }

    // If publishing for the first time, set publishedAt
    if (req.body.isPublished && !blog.isPublished && !blog.publishedAt) {
      req.body.publishedAt = new Date();
    }

    const updatedBlog = await Blog.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    res.json({
      success: true,
      data: updatedBlog
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

// @route   DELETE /api/content/blog/:id
// @desc    Delete blog post
// @access  Private/Admin
router.delete('/blog/:id', async (req, res) => {
  try {
    const blog = await Blog.findByIdAndDelete(req.params.id);

    if (!blog) {
      return res.status(404).json({
        success: false,
        message: 'Blog post not found'
      });
    }

    res.json({
      success: true,
      message: 'Blog post deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message || 'Server error'
    });
  }
});

export default router;

