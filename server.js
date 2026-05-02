const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Stripe Checkout implementation deployed

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

// Cache-busting middleware for static files and HTML
app.use((req, res, next) => {
  // Disable caching for HTML files
  if (req.path.endsWith('.html') || req.path === '/' || req.path.match(/^\/\?/)) {
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  next();
});

// Static file serving
app.use(express.static(path.join(__dirname), {
  maxAge: '1h',
  etag: true
}));

// UNIFIED WEBSITE - Single entry point
// App shell - handles authentication and routing to different views
// Replaced old index.html which was served statically and interfered with routing
// Force redeploy to pick up login.html fix
app.get('/', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  // GERUSO NEW BUILD TEST - server.js is executing
  res.sendFile(path.join(__dirname, 'app.html'));
});

// Login portal - standalone page
app.get('/login', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.sendFile(path.join(__dirname, 'login.html'));
});

// App page (main application)
app.get('/app', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.sendFile(path.join(__dirname, 'app.html'));
});

// EMBEDDED VIEWS (for iframes within app.html)
// Customer view - booking page (embedded)
app.get('/booking.html', (req, res) => {
  const fs = require('fs');
  let bookingHtml = fs.readFileSync(path.join(__dirname, 'booking.html'), 'utf8');
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || 'YOUR_API_KEY';
  bookingHtml = bookingHtml.replace('YOUR_API_KEY', apiKey);
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(bookingHtml);
});

// Owner dashboard view (embedded)
app.get('/index.html', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Dev dashboard view (embedded)
app.get('/admin-dashboard.html', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.sendFile(path.join(__dirname, 'admin-dashboard.html'));
});
app.get('/services', (req, res) => {
  const fs = require('fs');
  let servicesHtml = fs.readFileSync(path.join(__dirname, 'services.html'), 'utf8');
  // Inject Google Places API key if available
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || 'YOUR_API_KEY';
  servicesHtml = servicesHtml.replace('YOUR_API_KEY', apiKey);
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(servicesHtml);
});
app.get('/work', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.sendFile(path.join(__dirname, 'work.html'));
});
app.get('/memberships', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.sendFile(path.join(__dirname, 'memberships.html'));
});
app.get('/schedule', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.sendFile(path.join(__dirname, 'schedule.html'));
});
app.get('/reviews', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.sendFile(path.join(__dirname, 'reviews.html'));
});
app.get('/contact', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.sendFile(path.join(__dirname, 'contact.html'));
});
app.get('/booking', (req, res) => {
  const fs = require('fs');
  let bookingHtml = fs.readFileSync(path.join(__dirname, 'booking.html'), 'utf8');
  // Inject Google Places API key if available
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || 'YOUR_API_KEY';
  bookingHtml = bookingHtml.replace('YOUR_API_KEY', apiKey);
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(bookingHtml);
});
// ========== ADMIN ROUTES ==========
// Admin panel is now integrated into index.html
// Activated with ?admin=true parameter
// No separate admin routes needed
app.get('/success', (req, res) => res.sendFile(path.join(__dirname, 'success.html')));
app.get('/cancel', (req, res) => res.sendFile(path.join(__dirname, 'cancel.html')));

// API: Handle quote requests
app.post('/api/quote', async (req, res) => {
  try {
    console.log('[Quote API] POST /api/quote called');
    console.log('[Quote API] Request body:', req.body);

    const { firstName, lastName, email, phone, service, message } = req.body;

    // Validate (lastName is optional for quotes)
    if (!firstName || !email || !phone) {
      console.warn('[Quote API] Validation failed - missing required fields');
      return res.status(400).json({ error: 'Name, email, and phone are required' });
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
// Stripe webhook handler
const { handleWebhook, retrieveSession } = require('./stripe');
const pool = require('./db');

// Must use raw body for Stripe webhook verification
app.post('/api/webhook/stripe', express.raw({type: 'application/json'}), async (req, res) => {
  try {
    console.log('[Stripe Webhook] Received webhook');

    const signature = req.headers['stripe-signature'];
    if (!signature) {
      console.warn('[Stripe Webhook] No signature provided');
      return res.status(400).send('No signature');
    }

    const webhookResult = handleWebhook(req.body, signature);
    console.log('[Stripe Webhook] Result:', webhookResult.type);

    if (webhookResult.type === 'payment_succeeded') {
      const session = webhookResult.data;
      console.log('[Stripe Webhook] Session:', session.id);

      // Update booking payment status and auto-confirm
      try {
        const result = await pool.query(
          'UPDATE bookings SET payment_status = $1, status = $2, stripe_payment_intent_id = $3 WHERE stripe_session_id = $4 RETURNING *',
          ['paid', 'confirmed', session.payment_intent, session.id]
        );

        if (result.rows.length > 0) {
          const booking = result.rows[0];
          console.log('[Stripe Webhook] Booking paid and auto-confirmed:', booking.id);

          // Send confirmation email now that payment is confirmed
          const { sendBookingConfirmation } = require('./email');
          await sendBookingConfirmation({
            customerName: booking.customer_name,
            customerEmail: booking.customer_email,
            bookingDate: booking.booking_date,
            bookingTime: booking.booking_time,
            serviceType: booking.service_type,
            serviceAddress: booking.service_address,
            hasPhoto: !!booking.vehicle_photo
          });

          console.log('[Stripe Webhook] Confirmation email sent');
        }
      } catch (dbError) {
        console.error('[Stripe Webhook] Error updating booking:', dbError.message);
      }
    }

    res.json({ received: true });
  } catch (error) {
    console.error('[Stripe Webhook] Error:', error.message);
    res.status(400).send('Webhook error: ' + error.message);
  }
});

// API endpoint to get payment status
app.get('/api/payment-status/:bookingId', async (req, res) => {
  try {
    const { bookingId } = req.params;
    console.log('[Payment Status] Checking payment status for booking:', bookingId);

    const result = await pool.query(
      'SELECT payment_status, stripe_session_id FROM bookings WHERE id = $1',
      [bookingId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = result.rows[0];

    // If session exists, verify with Stripe
    if (booking.stripe_session_id) {
      try {
        const session = await retrieveSession(booking.stripe_session_id);
        console.log('[Payment Status] Session status:', session.payment_status);

        return res.json({
          paymentStatus: booking.payment_status,
          sessionStatus: session.payment_status
        });
      } catch (stripeError) {
        console.error('[Payment Status] Error retrieving Stripe session:', stripeError.message);
      }
    }

    res.json({ paymentStatus: booking.payment_status });
  } catch (error) {
    console.error('[Payment Status] Error:', error.message);
    res.status(500).json({ error: 'Failed to get payment status' });
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

// ========== UNIFIED AUTHENTICATION - LOGIN PORTAL ==========
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Unified login endpoint - works for customer, dev, and owner
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Find user by email
    const result = await pool.query(
      'SELECT id, email, password_hash, first_name, last_name, role, is_active FROM users WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];

    if (!user.is_active) {
      return res.status(401).json({ error: 'Account is inactive' });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    console.log(`[Auth] User logged in: ${email} (role: ${user.role})`);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role
      }
    });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Register endpoint - customers can self-register
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, first_name, last_name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user with customer role
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, role, is_active)
       VALUES ($1, $2, $3, $4, 'customer', true)
       RETURNING id, email, first_name, last_name, role`,
      [email, passwordHash, first_name || '', last_name || '']
    );

    if (result.rows.length === 0) {
      return res.status(500).json({ error: 'Failed to create account' });
    }

    const user = result.rows[0];

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );

    console.log(`[Auth] New user registered: ${email}`);

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        role: user.role
      }
    });
  } catch (error) {
    if (error.code === '23505') { // Unique constraint error
      return res.status(400).json({ error: 'Email already registered' });
    }
    console.error('[Auth] Register error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// DEBUG ENDPOINT: Fix test user passwords (remove in production)
app.post('/api/debug/fix-passwords', async (req, res) => {
  try {
    const testPassword = 'Test1234!';

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(testPassword, salt);

    // Update all test users
    const users = [
      'owner@geruso-detailing.com',
      'dev@geruso-detailing.com',
      'customer@example.com'
    ];

    const results = [];
    for (const email of users) {
      const result = await pool.query(
        'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE email = $2 RETURNING email, role',
        [passwordHash, email]
      );

      if (result.rows.length > 0) {
        results.push({ email: result.rows[0].email, role: result.rows[0].role, updated: true });
      } else {
        results.push({ email, updated: false });
      }
    }

    console.log('[Debug] Fixed test user passwords');
    res.json({
      success: true,
      message: 'Passwords fixed for test users',
      updated: results,
      testPassword: testPassword
    });
  } catch (error) {
    console.error('[Debug] Error fixing passwords:', error);
    res.status(500).json({ error: 'Failed to fix passwords' });
  }
});

// Test endpoint to verify deployment
app.get('/api/test-deployment', (req, res) => {
  res.json({ message: 'Deployment test - this should be visible if new code is deployed', timestamp: new Date().toISOString() });
});

// SIMPLE FIX: Direct password update (temporary, for testing only)
app.post('/api/quick-fix-passwords', async (req, res) => {
  try {
    const testPassword = 'Test1234!';

    // Generate hash using bcryptjs
    const bcrypt = require('bcryptjs');
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(testPassword, salt);

    console.log(`[Quick Fix] Generated hash for "${testPassword}": ${passwordHash}`);

    // Update users
    const users = ['owner@geruso-detailing.com', 'dev@geruso-detailing.com', 'customer@example.com'];
    for (const email of users) {
      await pool.query(
        'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE email = $2',
        [passwordHash, email]
      );
      console.log(`[Quick Fix] Updated ${email}`);
    }

    res.json({ success: true, message: 'Passwords fixed', hash: passwordHash });
  } catch (error) {
    console.error('[Quick Fix] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Legacy owner login for backward compatibility
const OWNER_PASSWORD = process.env.OWNER_PASSWORD || 'SecureOwner2024!';

app.post('/api/owner/login', (req, res) => {
  const { password } = req.body;
  if (password === OWNER_PASSWORD) {
    // Generate JWT token for owner
    const token = jwt.sign(
      { role: 'owner', email: 'owner@geruso-detailing.com' },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '7d' }
    );
    res.json({ success: true, token });
  } else {
    res.status(401).json({ success: false, error: 'Invalid password' });
  }
});

// Get current date and time in Eastern Time
function getCurrentTimeInEastern() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });

  const parts = formatter.formatToParts(now);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;
  const hour = parts.find(p => p.type === 'hour').value;
  const minute = parts.find(p => p.type === 'minute').value;

  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
    timeInMinutes: parseInt(hour) * 60 + parseInt(minute)
  };
}

// Get all bookings for owner (shows ONLY real customer bookings, not placeholder slots)
app.get('/api/owner/bookings', async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM bookings ORDER BY booking_date ASC, booking_time ASC"
    );

    // Filter: Show ONLY real customer bookings - remove all fake "Available Slot" placeholder rows
    const filteredBookings = result.rows.filter(booking => {
      const isPlaceholder = booking.customer_email === 'booking.test@gmail.com' && booking.customer_name === 'Available Slot';
      return !isPlaceholder; // Only keep real customer bookings
    });

    res.json({ bookings: filteredBookings });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Confirm booking
app.post('/api/owner/booking/:id/confirm', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'UPDATE bookings SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      ['confirmed', id]
    );
    res.json({ success: true, booking: result.rows[0] });
  } catch (error) {
    console.error('Error confirming booking:', error);
    res.status(500).json({ error: 'Failed to confirm booking' });
  }
});

// Mark booking completed
app.post('/api/owner/booking/:id/complete', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'UPDATE bookings SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      ['completed', id]
    );
    res.json({ success: true, booking: result.rows[0] });
  } catch (error) {
    console.error('Error completing booking:', error);
    res.status(500).json({ error: 'Failed to complete booking' });
  }
});

// Cancel booking
app.post('/api/owner/booking/:id/cancel', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'UPDATE bookings SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      ['cancelled', id]
    );
    res.json({ success: true, booking: result.rows[0] });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
});

// Delete booking
app.delete('/api/owner/booking/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM bookings WHERE id = $1 RETURNING *',
      [id]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting booking:', error);
    res.status(500).json({ error: 'Failed to delete booking' });
  }
});

// Get schedule
app.get('/api/owner/schedule', async (req, res) => {
  try {
    // Return default schedule - can be extended to fetch from database
    const schedule = {
      Monday: { status: 'open', start_time: '10:00', end_time: '18:00' },
      Tuesday: { status: 'open', start_time: '10:00', end_time: '18:00' },
      Wednesday: { status: 'open', start_time: '10:00', end_time: '18:00' },
      Thursday: { status: 'open', start_time: '12:00', end_time: '18:00' },
      Friday: { status: 'open', start_time: '12:00', end_time: '18:00' },
      Saturday: { status: 'open', start_time: '06:00', end_time: '11:00' },
      Sunday: { status: 'open', start_time: '06:00', end_time: '11:00' }
    };
    res.json({ schedule });
  } catch (error) {
    console.error('Error fetching schedule:', error);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

// Save schedule day
app.post('/api/owner/schedule-day', async (req, res) => {
  try {
    const { day, status, startTime, endTime } = req.body;
    // This can be extended to save to database
    console.log(`[Owner] Schedule updated for ${day}: ${status} ${startTime}-${endTime}`);
    res.json({ success: true });
  } catch (error) {
    console.error('Error saving schedule:', error);
    res.status(500).json({ error: 'Failed to save schedule' });
  }
});

// Get blocked dates
app.get('/api/owner/blocked-dates', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM blocked_dates ORDER BY blocked_date DESC'
    );
    res.json({ blockedDates: result.rows });
  } catch (error) {
    console.error('Error fetching blocked dates:', error);
    res.status(500).json({ error: 'Failed to fetch blocked dates' });
  }
});

// Block date
app.post('/api/owner/block-date', async (req, res) => {
  try {
    const { blockedDate, reason } = req.body;
    const result = await pool.query(
      'INSERT INTO blocked_dates (blocked_date, reason) VALUES ($1, $2) RETURNING *',
      [blockedDate, reason || null]
    );
    res.json({ success: true, blockedDate: result.rows[0] });
  } catch (error) {
    console.error('Error blocking date:', error);
    res.status(500).json({ error: 'Failed to block date' });
  }
});

// Unblock date
app.delete('/api/owner/blocked-date/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM blocked_dates WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error unblocking date:', error);
    res.status(500).json({ error: 'Failed to unblock date' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'geruso-detailing' });
});

// Admin: Reset system to availability slots (clears old bookings)
app.post('/api/admin/reset-availability', async (req, res) => {
  try {
    console.log('[Admin Reset] Resetting system to availability slots...');
    const { resetToAvailability } = require('./utils/clearBookings');

    const result = await resetToAvailability();

    res.json({
      success: true,
      message: result.message,
      details: 'All test bookings cleared. Fresh availability slots generated for next 60 days.'
    });
  } catch (error) {
    console.error('[Admin Reset] Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to reset availability: ' + error.message
    });
  }
});

// Explicit catch-all: serve index for non-API routes
// Note: All /admin routes are handled by explicit handlers above
app.use((req, res) => {
  // Skip catch-all for API routes (admin routes handled above)
  if (req.path.startsWith('/api')) {
    console.log('[Catch-all] API request not found:', req.path);
    return res.status(404).json({ error: 'Not Found' });
  }
  // For all other non-matching routes, serve index.html (for SPA routing)
  console.log('[Catch-all] Serving index.html for:', req.path);
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Create default admin account if none exists
async function createDefaultAdminIfNeeded() {
  try {
    const pool = require('./db');
    const bcrypt = require('bcryptjs');
    const { v4: uuidv4 } = require('uuid');

    // Check if any admin exists
    const adminCheck = await pool.query('SELECT COUNT(*) as count FROM admins');
    const adminCount = parseInt(adminCheck.rows[0].count);

    if (adminCount === 0) {
      console.log('[Admin] No admin account found, creating default admin...');

      const defaultEmail = 'admin@gerusodetailing.com';
      const defaultPassword = 'SecurePassword123!';

      // Hash the password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(defaultPassword, salt);

      // Create the admin account
      const result = await pool.query(
        'INSERT INTO admins (id, email, password_hash, is_active) VALUES ($1, $2, $3, $4) RETURNING id, email',
        [uuidv4(), defaultEmail, passwordHash, true]
      );

      console.log('[Admin] ✓ Default admin account created successfully');
      console.log('[Admin] Email:', defaultEmail);
      console.log('[Admin] Password:', defaultPassword);
      console.log('[Admin] Login at: /admin/login');
    } else {
      console.log('[Admin] ✓ Admin account(s) already exist');
    }
  } catch (error) {
    console.error('[Admin] Error creating default admin:', error.message);
    // Don't fail the startup if admin creation fails, the account might already exist
  }
}

// Initialize database on startup
async function initializeDatabase() {
  try {
    const pool = require('./db');
    const fs = require('fs');

    console.log('[Database] Checking database connection...');

    // Test the connection
    const testResult = await pool.query('SELECT 1');
    console.log('[Database] ✓ Successfully connected to PostgreSQL');

    // Read the migration file
    console.log('[Database] Running migrations...');
    const migrationSQL = fs.readFileSync(path.join(__dirname, 'migrations/001_init_schema.sql'), 'utf8');

    // Execute the migration
    await pool.query(migrationSQL);
    console.log('[Database] ✓ Database schema initialized successfully');

    // Create default admin if needed
    await createDefaultAdminIfNeeded();

    return true;
  } catch (error) {
    console.error('[Database] ✗ FATAL ERROR - Failed to initialize database:', error.message);
    console.error('[Database] Stack trace:', error.stack);
    console.error('[Database] Make sure DATABASE_URL environment variable is set correctly');
    console.error('[Database] DATABASE_URL:', process.env.DATABASE_URL ? 'SET (length: ' + process.env.DATABASE_URL.length + ')' : 'NOT SET');
    return false;
  }
}

// Start server after database initialization
// Regenerate availability slots using correct Eastern Time logic
async function regenerateAvailabilitySlots() {
  try {
    console.log('[Startup] Regenerating availability slots with Eastern Time...');

    const { getUpcomingAvailability, createPlaceholderBooking } = require('./utils/availability');

    // Clear old slots
    await pool.query('DELETE FROM bookings WHERE customer_email = $1 AND customer_name = $2',
      ['booking.test@gmail.com', 'Available Slot']);

    // Generate fresh slots
    const slots = getUpcomingAvailability(60);
    let insertedCount = 0;

    for (const slot of slots) {
      try {
        const placeholder = createPlaceholderBooking(slot.dateKey, slot.time);
        await pool.query(
          `INSERT INTO bookings (id, customer_name, customer_email, customer_phone, service_address, service_type, booking_date, booking_time, vehicle_type, notes, vehicle_photo, status, payment_status, stripe_session_id, stripe_payment_intent_id, deposit_amount, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
          [
            placeholder.id, placeholder.customer_name, placeholder.customer_email, placeholder.customer_phone,
            placeholder.service_address, placeholder.service_type, placeholder.booking_date, placeholder.booking_time,
            placeholder.vehicle_type, placeholder.notes, placeholder.vehicle_photo, placeholder.status,
            placeholder.payment_status, placeholder.stripe_session_id, placeholder.stripe_payment_intent_id,
            placeholder.deposit_amount, placeholder.created_at, placeholder.updated_at
          ]
        );
        insertedCount++;
      } catch (error) {
        if (error.code !== '23505') { // Skip duplicate key errors
          console.error('[Startup] Error inserting slot:', error.message);
        }
      }
    }

    console.log(`[Startup] ✓ Regenerated ${insertedCount} availability slots using Eastern Time`);
  } catch (error) {
    console.error('[Startup] Warning: Failed to regenerate slots:', error.message);
  }
}

async function startServer() {
  console.log('[Startup] ════════════════════════════════════════');
  console.log('[Startup] Starting Geruso Detailing server... [PHASE-1-BUILD-2025]');
  console.log('[Startup] NODE_ENV:', process.env.NODE_ENV);
  console.log('[Startup] Database URL:', process.env.DATABASE_URL ? 'CONFIGURED' : '⚠️ NOT SET');
  console.log('[Startup] Email config: RESEND_API_KEY =', process.env.RESEND_API_KEY ? 'SET' : 'NOT SET');
  console.log('[Startup] Owner email:', process.env.OWNER_EMAIL || 'NOT SET');
  console.log('[Startup] ════════════════════════════════════════');

  // Initialize database
  const dbReady = await initializeDatabase();

  if (!dbReady) {
    console.error('[Startup] ✗ Server startup failed: Database initialization failed');
    process.exit(1);
  }

  // Regenerate availability slots with correct Eastern Time logic
  await regenerateAvailabilitySlots();

  // Start listening for connections
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✓ 🚗 Geruso Detailing server running on port ${PORT}`);
    console.log(`✓ 📍 Listening on http://0.0.0.0:${PORT}`);
    console.log(`✓ Ready to accept bookings!\n`);
  });
}

// Start the server
startServer().catch((error) => {
  console.error('[Startup] Unexpected error:', error);
  process.exit(1);
});
// Trigger redeploy 1777734948
