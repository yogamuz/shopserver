const mongoose = require("mongoose");

// Schema untuk address yang lebih terstruktur
const addressSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      maxlength: 50,
      trim: true,
    },
    street: {
      type: String,
      required: true,
      trim: true,
    },
    city: {
      type: String,
      required: true,
      trim: true,
    },
    state: {
      type: String,
      required: true,
      trim: true,
    },
    zipCode: {
      type: String,
      required: true,
      trim: true,
    },
    country: {
      type: String,
      default: "Indonesia",
      trim: true,
    },
    label: {
      type: String, // 'Home', 'Office', 'Other'
      default: "Home",
    },
    isDefault: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);

const profileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    firstName: {
      type: String,
      trim: true,
    },
    lastName: {
      type: String,
      trim: true,
    },
    phone: {
      type: String,
      validate: {
        validator: function (v) {
          return !v || /^(\+62|0)[0-9]{8,13}$/.test(v);
        },
        message: "Phone number must be valid Indonesian format",
      },
    },
    // Support untuk multiple addresses
    addresses: [addressSchema],

    // Backward compatibility - keep old address field
    address: {
      type: String,
      trim: true,
    },

    avatar: {
      type: String,
      validate: {
        validator: function (v) {
          return !v || /^https?:\/\/.+/.test(v);
        },
        message: "Avatar must be a valid URL",
      },
    },
    dateOfBirth: Date,
    gender: {
      type: String,
      enum: ["male", "female", "other"],
    },
  },
  {
    timestamps: true,
  }
);

// Virtual untuk full name
profileSchema.virtual("fullName").get(function () {
  if (this.firstName && this.lastName) {
    return `${this.firstName} ${this.lastName}`;
  }
  return this.firstName || this.lastName || "";
});

// Virtual untuk default address
profileSchema.virtual("defaultAddress").get(function () {
  if (this.addresses && this.addresses.length > 0) {
    const defaultAddr = this.addresses.find(addr => addr.isDefault);
    return defaultAddr || this.addresses[0];
  }

  // Fallback ke old address field jika ada
  if (this.address) {
    return {
      street: this.address,
      city: "Unknown",
      state: "Unknown",
      zipCode: "Unknown",
      country: "Indonesia",
      label: "Home",
      isDefault: true,
      fullAddress: this.address,
    };
  }

  return null;
});

// Instance methods
profileSchema.methods.addAddress = function (addressData) {
  // Jika ini adalah address pertama, set sebagai default
  if (this.addresses.length === 0) {
    addressData.isDefault = true;
  }

  // Jika address baru di-set sebagai default, unset yang lama
  if (addressData.isDefault) {
    this.addresses.forEach(addr => {
      addr.isDefault = false;
    });
  }

  this.addresses.push(addressData);
  return this.save();
};

profileSchema.methods.updateAddress = function (addressIndex, addressData) {
  if (addressIndex < 0 || addressIndex >= this.addresses.length) {
    throw new Error("Invalid address index");
  }

  // Jika address di-update sebagai default, unset yang lama
  if (addressData.isDefault) {
    this.addresses.forEach((addr, index) => {
      if (index !== addressIndex) {
        addr.isDefault = false;
      }
    });
  }

  // Update address
  Object.assign(this.addresses[addressIndex], addressData);
  return this.save();
};

profileSchema.methods.removeAddress = function (addressIndex) {
  if (addressIndex < 0 || addressIndex >= this.addresses.length) {
    throw new Error("Invalid address index");
  }

  const wasDefault = this.addresses[addressIndex].isDefault;
  this.addresses.splice(addressIndex, 1);

  // Jika address yang dihapus adalah default dan masih ada address lain,
  // set address pertama sebagai default
  if (wasDefault && this.addresses.length > 0) {
    this.addresses[0].isDefault = true;
  }

  return this.save();
};

profileSchema.methods.setDefaultAddress = function (addressIndex) {
  if (addressIndex < 0 || addressIndex >= this.addresses.length) {
    throw new Error("Invalid address index");
  }

  // Unset semua default
  this.addresses.forEach(addr => {
    addr.isDefault = false;
  });

  // Set yang dipilih sebagai default
  this.addresses[addressIndex].isDefault = true;

  return this.save();
};

// Static methods
profileSchema.statics.findByUser = function (userId) {
  return this.findOne({ user: userId }).populate("user", "username email");
};

// Pre-save middleware
profileSchema.pre("save", function (next) {
  // Migrate old address to new addresses array if needed
  if (this.address && this.addresses.length === 0) {
    this.addresses.push({
      street: this.address,
      city: "Unknown",
      state: "Unknown",
      zipCode: "Unknown",
      country: "Indonesia",
      label: "Home",
      isDefault: true,
    });
  }

  // Ensure at least one address is default if addresses exist
  if (this.addresses.length > 0) {
    const hasDefault = this.addresses.some(addr => addr.isDefault);
    if (!hasDefault) {
      this.addresses[0].isDefault = true;
    }
  }

  next();
});

// Transform output
profileSchema.set("toJSON", {
  virtuals: true,
  transform: function (doc, ret) {
    // Add computed fields
    if (ret.defaultAddress) {
      ret.defaultAddress.fullAddress =
        ret.defaultAddress.fullAddress ||
        `${ret.defaultAddress.street}, ${ret.defaultAddress.city}, ${ret.defaultAddress.state} ${ret.defaultAddress.zipCode}, ${ret.defaultAddress.country}`;
    }

    return ret;
  },
});

profileSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Profile", profileSchema);
