const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const path = require('path');
const bcrypt = require('bcryptjs');

const axios = require('axios');

// Models
const User = require('./models/User');
const Product = require('./models/Product');
const Order = require('./models/Order');

const app = express();

// ---------------- MIDDLEWARE ----------------
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------- SESSION ----------------
app.use(session({
  secret: 'secretkey',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false }
}));

// ---------------- MONGODB ----------------
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch(err => console.log("MongoDB Error:", err));
;

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
        authorization: "YOUR_FAST2SMS_API_KEY_HERE",
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
  if (!user || !user.isVerified) {
    return res.status(403).json({ message: "Mobile verification required" });
  }
  next();
}

// ================= AUTH ROUTES =================
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body;

    const existing = await User.findOne({ username });
    if (existing)
      return res.status(400).json({ message: 'Username already exists' });

    const hash = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hash });
    await user.save();

    res.json({ message: 'Registered successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Registration failed' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await User.findOne({ username });
    if (!user)
      return res.status(400).json({ message: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok)
      return res.status(400).json({ message: 'Invalid credentials' });

    req.session.userId = user._id;
    req.session.username = username;

    res.json({ message: 'Login successful' });
  } catch (err) {
    res.status(500).json({ message: 'Login failed' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: 'Logged out' });
  });
});

app.get('/api/check-auth', (req, res) => {
  if (req.session.userId) {
    res.json({ loggedIn: true, username: req.session.username });
  } else {
    res.json({ loggedIn: false });
  }
});

// ================= OTP ROUTES =================
app.post('/api/send-otp', async (req, res) => {
  try {
    if (!req.session.userId)
      return res.status(401).json({ message: "Login required" });

    const { mobile } = req.body;
    const otp = Math.floor(100000 + Math.random() * 900000);

    const user = await User.findById(req.session.userId);
    if (!user)
      return res.status(404).json({ message: "User not found" });

    user.mobile = mobile;
    user.otp = otp;
    user.otpExpires = Date.now() + 5 * 60 * 1000;
    await user.save();

    console.log("OTP:", otp, "Mobile:", mobile);
    await sendOtpSMS(mobile, otp);

    res.json({ message: "OTP sent to mobile" });
  } catch (err) {
    res.status(500).json({ message: "OTP send failed" });
  }
});

app.post('/api/verify-otp', async (req, res) => {
  try {
    const { otp } = req.body;

    if (!req.session.userId)
      return res.status(401).json({ message: "Login required" });

    const user = await User.findById(req.session.userId);

    if (!user || String(user.otp) !== String(otp) || user.otpExpires < Date.now()) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    user.isVerified = true;
    user.otp = null;
    user.otpExpires = null;
    await user.save();

    res.json({ message: "Mobile verified successfully" });
  } catch (err) {
    res.status(500).json({ message: "OTP verification failed" });
  }
});

// ================= PRODUCTS =================
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (err) {
    res.status(500).json({ message: 'Failed to fetch products' });
  }
});

// ================= ORDERS =================
app.post('/api/order', otpVerified, async (req, res) => {
  try {
    const { items, paymentMethod } = req.body;

    const newOrder = new Order({
      userId: req.session.userId,
      items,
      paymentMethod, // COD / Offline
      status: "Pending"
    });

    await newOrder.save();
    res.json({ message: 'Order placed', order: newOrder });
  } catch (err) {
    res.status(500).json({ message: 'Order failed' });
  }
});

app.get('/api/orders', otpVerified, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.session.userId })
      .populate('items.productId', 'name price')
      .sort({ createdAt: -1 });

    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: 'Could not load orders' });
  }
});

// ================= ORDER TRACKING =================
app.get('/api/track-order/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('items.productId');

    if (!order)
      return res.status(404).json({ message: "Order not found" });

    res.json({
      orderId: order._id,
      status: order.status,
      items: order.items,
      paymentMethod: order.paymentMethod,
      createdAt: order.createdAt
    });
  } catch (err) {
    res.status(500).json({ message: "Error fetching order" });
  }
});

// ---------------- START SERVER ----------------
const PORT = 5000;
app.listen(PORT, () =>
  console.log(`Server running on http://localhost:${PORT}`)
);
