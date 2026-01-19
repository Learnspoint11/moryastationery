const express = require('express'); 
const mongoose = require('mongoose');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const axios = require('axios');
const cors = require('cors');
const path = require('path'); // ✅ added (required)

// Models
const User = require('./models/User');
const Product = require('./models/Product');
const Order = require('./models/Order');

const app = express();

/* ================= REQUIRED FOR RENDER ================= */
app.set('trust proxy', 1);
/* ======================================================= */

// ---------------- MIDDLEWARE ----------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(cors({
  origin: [
    "https://moryastationery.onrender.com",
    "https://moryastationery.netlify.app"
  ],
  credentials: true
}));
app.use('/images', express.static('public/images'));
// ---------------- SESSION ----------------
app.use(session({
  secret: process.env.SESSION_SECRET || "render-session-secret",
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false
  }
}));

// ---------------- MONGODB ----------------
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log("MongoDB Error:", err));

/* ======== WEBSITE FIX (ONLY CHANGE) ======== */
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
/* ========================================= */

// ---------------- OTP SMS FUNCTION ----------------
async function sendOtpSMS(mobile, otp) {
  await axios.post(
    "https://www.fast2sms.com/dev/bulkV2",
    {
      route: "otp",
      variables_values: otp,
      numbers: mobile
    },
    {
      headers: {
        authorization: process.env.FAST2SMS_API_KEY,
        "Content-Type": "application/json"
      }
    }
  );
}

// ---------------- OTP VERIFICATION MIDDLEWARE ----------------
async function otpVerified(req, res, next) {
  if (!req.session.userId)
    return res.status(401).json({ message: "Login required" });

  const user = await User.findById(req.session.userId);
  if (!user || !user.isVerified)
    return res.status(403).json({ message: "Mobile verification required" });

  next();
}

// ================= AUTH =================
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    const existing = await User.findOne({ username });
    if (existing)
      return res.status(400).json({ message: 'Username already exists' });

    const hash = await bcrypt.hash(password, 10);
    await new User({ username, password: hash }).save();

    res.json({ message: 'Registered successfully' });
  } catch {
    res.status(500).json({ message: 'Registration failed' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(400).json({ message: 'Invalid credentials' });

    req.session.userId = user._id;
    req.session.username = username;

    res.json({ message: 'Login successful' });
  } catch {
    res.status(500).json({ message: 'Login failed' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ message: 'Logged out' }));
});

app.get('/api/check-auth', (req, res) => {
  res.json({
    loggedIn: !!req.session.userId,
    username: req.session.username
  });
});

// ================= OTP =================
app.post('/api/send-otp', async (req, res) => {
  try {
    if (!req.session.userId)
      return res.status(401).json({ message: "Login required" });

    const { mobile } = req.body;
    const otp = Math.floor(100000 + Math.random() * 900000);

    const user = await User.findById(req.session.userId);
    user.mobile = mobile;
    user.otp = otp;
    user.otpExpires = Date.now() + 5 * 60 * 1000;
    await user.save();

    await sendOtpSMS(mobile, otp);
    res.json({ message: "OTP sent" });
  } catch {
    res.status(500).json({ message: "OTP failed" });
  }
});

app.post('/api/verify-otp', async (req, res) => {
  try {
    const user = await User.findById(req.session.userId);
    if (!user || user.otp != req.body.otp || user.otpExpires < Date.now())
      return res.status(400).json({ message: "Invalid OTP" });

    user.isVerified = true;
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    res.json({ message: "Mobile verified" });
  } catch {
    res.status(500).json({ message: "Verification failed" });
  }
});

// ================= PRODUCTS =================
app.get('/api/products', async (req, res) => {
  res.json(await Product.find());
});

// ================= ORDERS =================
app.post('/api/order', otpVerified, async (req, res) => {
  const order = await new Order({
    userId: req.session.userId,
    items: req.body.items,
    paymentMethod: req.body.paymentMethod,
    status: "Pending"
  }).save();

  res.json({ message: "Order placed", order });
});

app.get('/api/orders', otpVerified, async (req, res) => {
  res.json(await Order.find({ userId: req.session.userId }).sort({ createdAt: -1 }));
});

// ---------------- START SERVER ----------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
