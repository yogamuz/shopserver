
const mongoose = require("mongoose");

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  description: String,
  image: String,
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

categorySchema.virtual('products', {
  ref: 'Product',
  localField: '_id',
  foreignField: 'category',
  justOne: false
});

categorySchema.virtual('activeProducts', {
  ref: 'Product',
  localField: '_id',
  foreignField: 'category',
  justOne: false,
  match: { isActive: true }
});

categorySchema.index({ name: 1, isActive: 1 });
categorySchema.index({ isActive: 1 });

categorySchema.methods.getProductCount = function() {
  return mongoose.model('Product').countDocuments({ 
    category: this._id,
    isActive: true 
  });
};

categorySchema.methods.getAveragePrice = function() {
  return mongoose.model('Product').aggregate([
    { $match: { category: this._id, isActive: true } },
    { $group: { _id: null, avgPrice: { $avg: '$price' } } }
  ]);
};

categorySchema.statics.getCategoriesWithProductCount = function() {
  return this.aggregate([
    { $match: { isActive: true } },
    {
      $lookup: {
        from: 'products',
        localField: '_id',
        foreignField: 'category',
        as: 'products',
        pipeline: [{ $match: { isActive: true } }]
      }
    },
    {
      $addFields: {
        productCount: { $size: '$products' }
      }
    },
    {
      $project: {
        name: 1,
        description: 1,
        image: 1,
        productCount: 1,
        createdAt: 1,
        updatedAt: 1
      }
    },
    { $sort: { productCount: -1 } }
  ]);
};

categorySchema.pre('deleteOne', { document: true, query: false }, async function(next) {
  const productCount = await mongoose.model('Product').countDocuments({ 
    category: this._id 
  });
  
  if (productCount > 0) {
    const error = new Error('Cannot delete category with existing products');
    error.code = 'CATEGORY_HAS_PRODUCTS';
    return next(error);
  }
  next();
});

categorySchema.set('toJSON', { virtuals: true });
categorySchema.set('toObject', { virtuals: true });

module.exports = mongoose.model("Category", categorySchema);