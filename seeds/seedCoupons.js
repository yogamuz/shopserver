// ========================================
// 2. seedCoupons.js - IMPROVED VERSION
// ========================================
const mongoose = require("mongoose");
const path = require("path");
const Coupon = require("../src/models/coupon.model");

// ✅ FIXED: Load environment variables
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const seedCoupons = async () => {
  try {
    // Hapus semua coupon yang ada (opsional, untuk development)
    await Coupon.deleteMany({});
    console.log("🗑️ Existing coupons cleared");

    const coupons = [
      {
        code: "FASH18",
        discount: 18,
        category: "fashion",
        minAmount: 0,
        maxDiscount: 150000,
        description: "18% discount for fashion items",
        usageLimit: 1000,
        expiryDate: new Date("2027-3-31"),
      },
      {
        code: "FURN25",
        discount: 25,
        category: "furniture",
        minAmount: 0,
        maxDiscount: 200000,
        description: "25% discount for furniture items",
        usageLimit: 500,
        expiryDate: new Date("2027-3-31"),
      },
      {
        code: "GADG30",
        discount: 30,
        category: "gadgets",
        minAmount: 0,
        maxDiscount: 250000,
        description: "30% discount for gadget items",
        usageLimit: 750,
        expiryDate: new Date('2027-03-31'),
      },
      {
        code: "TOYS15",
        discount: 15,
        category: "toys",
        minAmount: 0,
        maxDiscount: 100000,
        description: "15% discount for toy items",
        usageLimit: 300,
        expiryDate: new Date("2027-03-31"),
      },
      {
        code: "BEAUTY24",
        discount: 24,
        category: "beauty",
        minAmount: 0,
        maxDiscount: 180000,
        description: "24% discount for beauty products",
        usageLimit: 600,
        expiryDate: new Date("2027-03-31"),
      },
      {
        code: "KERS40",
        discount: 40,
        category: "sneakers",
        minAmount: 0,
        maxDiscount: 200000,
        description: "40% discount for sneakers",
        usageLimit: 200,
        expiryDate: new Date("2027-03-31"),
      },
      {
        code: "SAVE10",
        discount: 10,
        minAmount: 50000,
        maxDiscount: 50000,
        description: "10% discount for all items with minimum purchase",
        usageLimit: 2000,
        expiryDate: new Date("2027-03-31"),
      },

    ];

    const createdCoupons = await Coupon.insertMany(coupons);
    console.log(`✅ Successfully created ${createdCoupons.length} coupons`);

    return createdCoupons;
  } catch (error) {
    console.error("❌ Error seeding coupons:", error);
    throw error;
  }
};

const runSeed = async () => {
  try {
    console.log("🎟️ Starting coupon seeding...");

    // ✅ FIXED: Dynamic connection yang konsisten
    const mongoUri =
      process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/shop-cart";
    console.log(
      `🔗 Connecting to: ${mongoUri.replace(/\/\/.*@/, "//***:***@")}`
    );

    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
      console.log("✅ Connected to MongoDB");
    }

    await seedCoupons();
    console.log("🎉 Coupon seeding completed");
  } catch (error) {
    console.error("💥 Seeding failed:", error);
    throw error;
  }
};

module.exports = {
  seedCoupons,
  runSeed,
};

// ✅ FIXED: Proper execution dan cleanup
if (require.main === module) {
  runSeed()
    .then(() => mongoose.disconnect())
    .then(() => {
      console.log("🔌 Database connection closed");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Script failed:", error);
      mongoose.disconnect().finally(() => process.exit(1));
    });
}
