// ========================================
// 3. userSeeds.js - ALREADY GOOD, minor improvement
// ========================================
const mongoose = require("mongoose");
const User = require("../src/models/user.model");
const Profile = require("../src/models/profile.model");
const bcrypt = require("bcryptjs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const userSeeds = [
  {
    username: "admin",
    email: "admin@shopcart.com",
    password: "adminshopcart",
    role: "admin"
  },
  {
    username: "muz",
    email: "yogamuz13@gmail.com",
    password: "muz1234",
    role: "user"
  },
  {
    username: "rudy_gans",
    email: "rudy@gmail.com",
    password : "rudy1234",
    role: "seller"
  
  }

];

const profileSeeds = [
  {
    firstName: "admin",
    lastName: "shopcart",
    phone: "081234567890",
    address: "123 Main St, City"
  },
];

const seedUsers = async () => {
  try {
    // ✅ Dynamic connection dengan fallback dan logging
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/shop-cart';
    console.log(`🔗 Connecting to: ${mongoUri.replace(/\/\/.*@/, '//***:***@')}`);
    
    await mongoose.connect(mongoUri);
    console.log("✅ Connected to MongoDB");

    // Clean collections
    await User.deleteMany({});
    await Profile.deleteMany({});
    console.log("🗑️ Collections cleaned");

    // Hash passwords and create users
    const users = [];
    for (let userData of userSeeds) {
      userData.password = await bcrypt.hash(userData.password, 12);
      users.push(await User.create(userData));
    }

    // Create profiles for each user
    for (let i = 0; i < users.length; i++) {
      await Profile.create({
        user: users[i]._id,
        ...profileSeeds[i]
      });
    }

    console.log("✅ Users and profiles seeded successfully");

  } catch (error) {
    console.error("❌ Error seeding users:", error);
    throw error;
  }
};

// ✅ FIXED: Proper execution dan cleanup
const runUserSeed = async () => {
  try {
    console.log("👥 Starting user seeding...");
    await seedUsers();
    console.log("🎉 User seeding completed");
  } catch (error) {
    console.error("💥 User seeding failed:", error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log("🔌 Database connection closed");
  }
};

// Execute the seed function
if (require.main === module) {
  runUserSeed();
}