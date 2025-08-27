// ========================================
// 1. seedCategories.js - FIXED VERSION
// ========================================
const mongoose = require('mongoose');
const path = require('path');
const Category = require('../src/models/category.model');

// ✅ FIXED: Load environment variables
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Data kategori baru yang akan ditambahkan
const newCategories = [
  {
    _id: new mongoose.Types.ObjectId('66d1a2b3c4e5f6789abcdef0'),
    name: 'beauty',
    description: 'Beauty products including cosmetics, skincare, and personal care items',
    image: '/images/categories/beauty.png',
    isActive: true
  },
  {
    _id: new mongoose.Types.ObjectId('66d1a2b3c4e5f6789abcdef1'),
    name: 'fashion',
    description: 'Fashion items including clothing, accessories, and style essentials',
    image: '/images/categories/fashion.png',
    isActive: true
  },
  {
    _id: new mongoose.Types.ObjectId('66d1a2b3c4e5f6789abcdef2'),
    name: 'sneakers',
    description: 'Sneakers and athletic footwear for all occasions',
    image: '/images/categories/sneakers.png',
    isActive: true
  },
  {
    _id: new mongoose.Types.ObjectId('66d1a2b3c4e5f6789abcdef3'),
    name: 'toys',
    description: 'Toys and games for children and adults',
    image: '/images/categories/toys.png',
    isActive: true
  },
  {
    _id: new mongoose.Types.ObjectId('66d1a2b3c4e5f6789abcdef4'),
    name: 'furniture',
    description: 'Home and office furniture for comfortable living',
    image: '/images/categories/furniture.png',
    isActive: true
  },
  {
    _id: new mongoose.Types.ObjectId('66d1a2b3c4e5f6789abcdef5'),
    name: 'gadgets',
    description: 'Electronic gadgets and tech accessories',
    image: '/images/categories/gadgets.png',
    isActive: true
  }
];

const seedCategories = async () => {
  try {
    console.log('🌱 Starting category seeding...');
    
    // ✅ FIXED: Dynamic connection dengan fallback
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/shop-cart';
    console.log(`🔗 Connecting to: ${mongoUri.replace(/\/\/.*@/, '//***:***@')}`); // Hide credentials in log
    
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
    
    // Cek kategori yang sudah ada
    const existingCategories = await Category.find({
      name: { $in: newCategories.map(cat => cat.name) }
    });
    
    console.log(`📊 Found ${existingCategories.length} existing categories`);
    
    // Filter kategori yang belum ada
    const existingNames = existingCategories.map(cat => cat.name);
    const categoriesToAdd = newCategories.filter(cat => !existingNames.includes(cat.name));
    
    if (categoriesToAdd.length === 0) {
      console.log('✅ All categories already exist!');
    } else {
      console.log(`➕ Adding ${categoriesToAdd.length} new categories...`);
      const insertedCategories = await Category.insertMany(categoriesToAdd);
      
      console.log('✅ Categories added successfully:');
      insertedCategories.forEach(cat => {
        console.log(`   - ${cat.name} (ID: ${cat._id})`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error seeding categories:', error);
    if (error.code === 11000) {
      console.error('Duplicate key error - some categories already exist');
    }
    throw error;
  }
};

const listAllCategories = async () => {
  try {
    const categories = await Category.find({}).select('_id name isActive createdAt');
    console.log('\n📋 All Categories:');
    categories.forEach(cat => {
      console.log(`   - ${cat.name} | ID: ${cat._id} | Active: ${cat.isActive}`);
    });
  } catch (error) {
    console.error('❌ Error listing categories:', error);
  }
};

const seedCategoriesRoute = async (req, res) => {
  try {
    await seedCategories();
    const allCategories = await Category.find({}).select('_id name isActive');
    
    res.json({
      success: true,
      message: 'Categories seeded successfully',
      totalCategories: allCategories.length,
      categories: allCategories
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

module.exports = {
  seedCategories,
  listAllCategories,
  newCategories,
  seedCategoriesRoute
};

// ✅ FIXED: Proper execution dan cleanup
if (require.main === module) {
  seedCategories()
    .then(() => listAllCategories())
    .then(() => {
      console.log('🎉 Category seeding completed!');
      return mongoose.disconnect();
    })
    .then(() => {
      console.log('🔌 Database connection closed');
      process.exit(0);
    })
    .catch(error => {
      console.error('💥 Script failed:', error);
      mongoose.disconnect().finally(() => process.exit(1));
    });
}