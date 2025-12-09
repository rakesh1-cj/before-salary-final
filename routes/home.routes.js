import express from 'express';
import HomeLoanCard from '../models/HomeLoanCard.model.js';
import HomeInfoCard from '../models/HomeInfoCard.model.js';
import HomeBenefitCard from '../models/HomeBenefitCard.model.js';

const router = express.Router();

// @route   GET /api/home/loan-cards
// @desc    Get all active home loan cards (public)
// @access  Public
router.get('/loan-cards', async (req, res) => {
  try {
    const cards = await HomeLoanCard.find({ isActive: true })
      .sort({ order: 1, createdAt: 1 })
      .select('-__v');
    
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

// @route   GET /api/home/info-cards
router.get('/info-cards', async (req, res) => {
  try {
    const cards = await HomeInfoCard.find({ isActive: true })
      .sort({ order: 1, createdAt: 1 })
      .select('-__v');

    res.json({ success: true, data: cards });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

// @route   GET /api/home/benefit-cards
router.get('/benefit-cards', async (req, res) => {
  try {
    const cards = await HomeBenefitCard.find({ isActive: true })
      .sort({ order: 1, createdAt: 1 })
      .select('-__v');

    res.json({ success: true, data: cards });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message || 'Server error' });
  }
});

export default router;

