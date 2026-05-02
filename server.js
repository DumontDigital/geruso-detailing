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
app.use(express.static(path.join(__dirname)));

// Serve all HTML pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/services', (req, res) => {
  const fs = require('fs');
  let servicesHtml = fs.readFileSync(path.join(__dirname, 'services.html'), 'utf8');
  // Inject Google Places API key if available
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || 'YOUR_API_KEY';
  servicesHtml = servicesHtml.replace('YOUR_API_KEY', apiKey);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(servicesHtml);
});
app.get('/work', (req, res) => res.sendFile(path.join(__dirname, 'work.html')));
app.get('/memberships', (req, res) => res.sendFile(path.join(__dirname, 'memberships.html')));
app.get('/schedule', (req, res) => res.sendFile(path.join(__dirname, 'schedule.html')));
app.get('/reviews', (req, res) => res.sendFile(path.join(__dirname, 'reviews.html')));
app.get('/contact', (req, res) => res.sendFile(path.join(__dirname, 'contact.html')));
app.get('/booking', (req, res) => {
  const fs = require('fs');
  let bookingHtml = fs.readFileSync(path.join(__dirname, 'booking.html'), 'utf8');
  // Inject Google Places API key if available
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || 'YOUR_API_KEY';
  bookingHtml = bookingHtml.replace('YOUR_API_KEY', apiKey);
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

// API: Handle owner update requests
app.post('/api/owner-request', async (req, res) => {
  try {
    console.log('[Owner Request] Received owner update request');
    const { requestType, requestDetails } = req.body;

    if (!requestType || !requestDetails) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Send email to owner
    const { sendOwnerEmail } = require('./email');
    const emailResult = await sendOwnerEmail({
      requestType,
      requestDetails,
      submittedAt: new Date().toISOString()
    });

    if (!emailResult.success) {
      console.error('[Owner Request] Email send failed:', emailResult.error);
      return res.status(500).json({
        success: false,
        error: emailResult.error || 'Failed to send request'
      });
    }

    console.log('[Owner Request] SUCCESS - Owner email sent');
    return res.json({
      success: true,
      message: 'Your update request has been sent to the owner'
    });
  } catch (error) {
    console.error('[Owner Request] ERROR:', error.message);
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

      // Update booking payment status
      try {
        const result = await pool.query(
          'UPDATE bookings SET payment_status = $1, stripe_payment_intent_id = $2 WHERE stripe_session_id = $3 RETURNING *',
          ['paid', session.payment_intent, session.id]
        );

        if (result.rows.length > 0) {
          const booking = result.rows[0];
          console.log('[Stripe Webhook] Booking marked as paid:', booking.id);

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
async function startServer() {
  console.log('[Startup] Starting Geruso Detailing server...');
  console.log('[Startup] NODE_ENV:', process.env.NODE_ENV);
  console.log('[Startup] Database URL:', process.env.DATABASE_URL ? 'CONFIGURED' : '⚠️ NOT SET');
  console.log('[Startup] Email config: RESEND_API_KEY =', process.env.RESEND_API_KEY ? 'SET' : 'NOT SET');
  console.log('[Startup] Owner email:', process.env.OWNER_EMAIL || 'NOT SET');

  // Initialize database
  const dbReady = await initializeDatabase();

  if (!dbReady) {
    console.error('[Startup] ✗ Server startup failed: Database initialization failed');
    process.exit(1);
  }

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
