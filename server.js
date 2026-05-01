const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { sendQuoteEmail } = require('./email');
const authRoutes = require('./routes/auth');
const bookingsRoutes = require('./routes/bookings');
const availabilityRoutes = require('./routes/availability');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Serve all HTML pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/services', (req, res) => res.sendFile(path.join(__dirname, 'services.html')));
app.get('/work', (req, res) => res.sendFile(path.join(__dirname, 'work.html')));
app.get('/memberships', (req, res) => res.sendFile(path.join(__dirname, 'memberships.html')));
app.get('/schedule', (req, res) => res.sendFile(path.join(__dirname, 'schedule.html')));
app.get('/reviews', (req, res) => res.sendFile(path.join(__dirname, 'reviews.html')));
app.get('/contact', (req, res) => res.sendFile(path.join(__dirname, 'contact.html')));
app.get('/booking', (req, res) => res.sendFile(path.join(__dirname, 'booking.html')));
app.get('/admin/login', (req, res) => res.sendFile(path.join(__dirname, 'admin-login.html')));
app.get('/admin/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'admin-dashboard.html')));

// API: Handle quote requests
app.post('/api/quote', async (req, res) => {
  try {
    console.log('[Quote API] POST /api/quote called');
    console.log('[Quote API] Request body:', req.body);

    const { firstName, lastName, email, phone, service, message } = req.body;

    // Validate
    if (!firstName || !lastName || !email || !phone) {
      console.warn('[Quote API] Validation failed - missing required fields');
      return res.status(400).json({ error: 'All required fields must be filled' });
    }

    const quoteData = { firstName, lastName, email, phone, service, message };

    // Send email notification
    console.log('[Quote API] Calling sendQuoteEmail...');
    const emailResult = await sendQuoteEmail(quoteData);

    if (!emailResult.success) {
      console.error('[Quote API] Email send failed:', emailResult.error);
      return res.status(500).json({
        success: false,
        error: emailResult.error || 'Failed to send quote. Please try again or call us directly.'
      });
    }

    // Log quote request
    console.log('[Quote API] SUCCESS - Quote email sent:', { firstName, lastName, email, phone, service });

    // Return success
    return res.json({
      success: true,
      message: 'Quote request received! We\'ll contact you within 24 hours.',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Quote API] UNEXPECTED ERROR:', error.message);
    console.error('[Quote API] Stack trace:', error.stack);
    return res.status(500).json({
      success: false,
      error: 'Server error: ' + error.message
    });
  }
});

// Database initialization (run SQL migrations)
app.get('/api/init-db', async (req, res) => {
  try {
    console.log('[Init-DB] Starting database initialization...');
    const fs = require('fs');
    const pool = require('./db');

    // Read migration file
    const migrationSQL = fs.readFileSync(path.join(__dirname, 'migrations/001_init_schema.sql'), 'utf8');

    // Run migrations
    await pool.query(migrationSQL);

    console.log('[Init-DB] SUCCESS - Database tables created');
    res.json({ success: true, message: 'Database initialized successfully' });
  } catch (error) {
    console.error('[Init-DB] ERROR:', error.message);
    // Don't return error details in production
    res.status(500).json({ success: false, error: 'Database initialization failed' });
  }
});

// Register API routes
app.use('/api/admin', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/availability', availabilityRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'geruso-detailing' });
});

// 404 fallback - serve index for SPA-like behavior
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚗 Geruso Detailing server running on port ${PORT}`);
  console.log(`📍 Listening on 0.0.0.0:${PORT}`);
  console.log('[Startup] NODE_ENV:', process.env.NODE_ENV);
  console.log('[Startup] Email config loaded: RESEND_API_KEY =', process.env.RESEND_API_KEY ? 'SET' : 'NOT SET');
  console.log('[Startup] Owner email destination: OWNER_EMAIL =', process.env.OWNER_EMAIL);
});
