import mongoose from 'mongoose';
import slugify from 'slugify';

const LoanCategorySchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true, trim: true, maxlength: 100 },
  slug: { type: String, required: true, unique: true, lowercase: true, index: true },
  description: { type: String, maxlength: 500 },
  image: { type: String }, // URL or path to the category image
  active: { type: Boolean, default: true }
}, { timestamps: true });

LoanCategorySchema.pre('validate', function(next) {
  if (this.name) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
  next();
});

export default mongoose.model('LoanCategory', LoanCategorySchema);
