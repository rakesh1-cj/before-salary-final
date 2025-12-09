import express from 'express';
import { protect } from '../middleware/auth.middleware.js';
import LoanApplicationFormField from '../models/LoanApplicationFormField.model.js';

const router = express.Router();

function admin(req, res) {
  if (req.user.role !== 'admin') {
    res.status(403).json({ success: false, message: 'Admin only' });
    return false;
  }
  return true;
}

// @route   GET /api/form-fields/loan/:loanId
// @desc    Get all form fields for a loan
// @access  Private
router.get('/loan/:loanId', protect, async (req, res) => {
  try {
    const fields = await LoanApplicationFormField.find({ 
      loanId: req.params.loanId,
      isActive: true
    }).sort({ order: 1, createdAt: 1 });
    res.json({ success: true, data: fields });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// @route   GET /api/form-fields/category/:categoryId
// @desc    Get all form fields for a category
// @access  Private
router.get('/category/:categoryId', protect, async (req, res) => {
  try {
    const fields = await LoanApplicationFormField.find({ 
      categoryId: req.params.categoryId,
      isActive: true
    }).sort({ section: 1, order: 1, createdAt: 1 });
    res.json({ success: true, data: fields });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// @route   GET /api/form-fields/:loanId (backward compatibility)
// @desc    Get all form fields for a loan (admin only)
// @access  Private/Admin
router.get('/:loanId', protect, async (req, res) => {
  if (!admin(req, res)) return;
  try {
    const fields = await LoanApplicationFormField.find({ 
      loanId: req.params.loanId 
    }).sort({ order: 1, createdAt: 1 });
    res.json({ success: true, data: fields });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// @route   POST /api/form-fields
// @desc    Create a new form field
// @access  Private/Admin
router.post('/', protect, async (req, res) => {
  if (!admin(req, res)) return;
  try {
    const { loanId, categoryId, name, type, width, required, placeholder, label, options, order, section } = req.body;
    
    if ((!loanId && !categoryId) || !name || !type) {
      return res.status(400).json({ 
        success: false, 
        message: 'Either loanId or categoryId, name, and type are required' 
      });
    }

    if (loanId && categoryId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Cannot specify both loanId and categoryId' 
      });
    }

    const field = await LoanApplicationFormField.create({
      loanId: loanId || undefined,
      categoryId: categoryId || undefined,
      name: name.trim(),
      type,
      width: width || 'full',
      required: required || false,
      placeholder: placeholder?.trim(),
      label: label?.trim() || name.trim(),
      options: options || [],
      order: order || 0,
      section: section || 'employment',
      isActive: true
    });

    res.status(201).json({ success: true, data: field });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// @route   PUT /api/form-fields/:id
// @desc    Update a form field
// @access  Private/Admin
router.put('/:id', protect, async (req, res) => {
  if (!admin(req, res)) return;
  try {
    const { name, type, width, required, placeholder, label, options, order, isActive, section } = req.body;
    const field = await LoanApplicationFormField.findById(req.params.id);
    
    if (!field) {
      return res.status(404).json({ success: false, message: 'Form field not found' });
    }

    if (name) field.name = name.trim();
    if (type) field.type = type;
    if (width) field.width = width;
    if (required !== undefined) field.required = required;
    if (placeholder !== undefined) field.placeholder = placeholder?.trim();
    if (label !== undefined) field.label = label?.trim();
    if (options !== undefined) field.options = options;
    if (order !== undefined) field.order = order;
    if (isActive !== undefined) field.isActive = isActive;
    if (section !== undefined) field.section = section;

    await field.save();
    res.json({ success: true, data: field });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// @route   DELETE /api/form-fields/:id
// @desc    Delete a form field
// @access  Private/Admin
router.delete('/:id', protect, async (req, res) => {
  if (!admin(req, res)) return;
  try {
    const field = await LoanApplicationFormField.findById(req.params.id);
    if (!field) {
      return res.status(404).json({ success: false, message: 'Form field not found' });
    }
    await field.deleteOne();
    res.json({ success: true, message: 'Form field deleted' });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

export default router;

