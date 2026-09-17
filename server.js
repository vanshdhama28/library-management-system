const express = require('express');
const path = require('path');
const cors = require('cors');
const { initDatabase } = require('./database');

const authRoutes = require('./routes/auth');
const booksRoutes = require('./routes/books');
const bookingsRoutes = require('./routes/bookings');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Lazy Database Initialization for Vercel Serverless Functions
let dbInitialized = false;
let dbInitPromise = null;

app.use(async (req, res, next) => {
  if (!dbInitialized) {
    if (!dbInitPromise) {
      dbInitPromise = initDatabase().then(() => {
        dbInitialized = true;
      }).catch(err => {
        console.error('Database init error:', err);
      });
    }
    await dbInitPromise;
  }
  next();
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/books', booksRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/admin', adminRoutes);

// Fallback to index.html for SPA-style routing if needed
app.use((req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Local server listener
if (!process.env.VERCEL) {
  initDatabase().then(() => {
    app.listen(PORT, () => {
      console.log(`=======================================================`);
      console.log(`  📚 Library Booking System running on port ${PORT}`);
      console.log(`  👉 Web Portal: http://localhost:${PORT}`);
      console.log(`=======================================================`);
    });
  });
}

// Export Express app for Vercel Serverless Functions
module.exports = app;
