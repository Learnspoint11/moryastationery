const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },

  password: {
    type: String,
    required: true
  },

  isVerified: {
    type: Boolean,
    default: true   // username/password login → no OTP/email verification
  }

}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
