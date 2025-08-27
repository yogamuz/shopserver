const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  firstName: String,
  lastName: String,
  phone: String,
  address: String,
  avatar: String
}, {
  timestamps: true
});

module.exports = mongoose.model('Profile', profileSchema);