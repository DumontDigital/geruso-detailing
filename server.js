const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

// Stripe Checkout implementation deployed

const { sendQuoteEmail } = require('./email');
const authRoutes = require('./routes/auth');
const bookingsRoutes = require('./routes/bookings');
const cartRoutes = require('./routes/cart');
const availabilityRoutes = require('./routes/availability');
const adminRoutes = require('./routes/admin');
const { router: maintenanceRoutes, activateSubscriptionFromSession } = require('./routes/maintenance');
const { verifyToken, requireRole } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

function sendHtmlWithGooglePlacesKey(res, fileName) {
  const fs = require('fs');
  let html = fs.readFileSync(path.join(__dirname, fileName), 'utf8');
  const apiKey = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_MAPS_API_KEY || 'YOUR_API_KEY';
  html = html.replace(/YOUR_API_KEY/g, apiKey);
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Cache-busting middleware for HTML files
app.use((req, res, next) => {
  // Disable ALL caching for HTML files
  if (req.path.endsWith('.html') || req.path === '/' || req.path.match(/^\/\?/)) {
    res.set('Cache-Control', 'no-store, must-revalidate, max-age=0, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
  }
  next();
});

// UNIFIED WEBSITE - Single entry point
// App shell - handles authentication and routing to different views
// Replaced old index.html which was served statically and interfered with routing
// Force redeploy to pick up login.html fix
app.get('/', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  // Customer home (with shared nav including Sign In + Cart)
  res.sendFile(path.join(__dirname, 'home.html'));
});

// Clean customer-only entry point. This serves the public home page and
// lets the customer shell clear any saved owner/dev session in that browser.
app.get('/customer', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.sendFile(path.join(__dirname, 'home.html'));
});

// Login portal - standalone page
app.get('/login', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.sendFile(path.join(__dirname, 'login.html'));
});

// App page (main application - authenticated users only)
app.get('/app', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  // Authenticated dashboard
  res.sendFile(path.join(__dirname, 'app.html'));
});

// Dashboard alias (after login redirect)
app.get('/dashboard', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.sendFile(path.join(__dirname, 'app.html'));
});

// /booking.html now redirects to /schedule.html (single source of truth for booking).
// The old booking.html welcome page was confusing users — every "Book Now"/"Book a Service"
// link in the codebase still works because of this redirect.
app.get('/booking.html', (req, res) => {
  res.redirect(301, '/schedule.html');
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
  sendHtmlWithGooglePlacesKey(res, 'services.html');
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
  sendHtmlWithGooglePlacesKey(res, 'schedule.html');
});
app.get('/schedule.html', (req, res) => {
  sendHtmlWithGooglePlacesKey(res, 'schedule.html');
});
app.get('/reviews', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.sendFile(path.join(__dirname, 'reviews.html'));
});
app.get('/contact', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.sendFile(path.join(__dirname, 'contact.html'));
});
app.get('/checkout', (req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
  res.sendFile(path.join(__dirname, 'checkout.html'));
});
app.get('/booking', (req, res) => {
  res.redirect(301, '/schedule.html');
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

      if (session.metadata?.source === 'maintenance_subscription') {
        await activateSubscriptionFromSession(session);
        console.log('[Stripe Webhook] Maintenance membership activated:', session.id);
        return res.json({ received: true });
      }

      // Update booking payment status and auto-confirm
      try {
        const bookingIdFromMetadata = session.metadata && session.metadata.booking_id;
        const result = await pool.query(
          `WITH existing AS (
             SELECT payment_status FROM bookings
             WHERE stripe_session_id = $4 OR id = $5
           )
           UPDATE bookings
           SET payment_status = $1,
               status = $2,
               stripe_payment_intent_id = $3,
               stripe_session_id = COALESCE(stripe_session_id, $4),
               updated_at = CURRENT_TIMESTAMP
           FROM existing
           WHERE stripe_session_id = $4 OR id = $5
           RETURNING bookings.*, existing.payment_status AS previous_payment_status`,
          ['paid', 'confirmed', session.payment_intent, session.id, bookingIdFromMetadata || null]
        );

        if (result.rows.length > 0) {
          const booking = result.rows[0];
          console.log('[Stripe Webhook] Booking paid and auto-confirmed:', booking.id);

          // Send emails now that payment is confirmed.
          const { sendBookingConfirmation, sendOwnerNotification } = require('./email');
          const paidBookingEmailData = {
            customerName: booking.customer_name,
            customerEmail: booking.customer_email,
            customerPhone: booking.customer_phone,
            bookingDate: booking.booking_date,
            bookingTime: booking.booking_time,
            serviceType: booking.service_type,
            serviceAddress: booking.service_address,
            vehicleType: booking.vehicle_type,
            notes: booking.notes,
            hasPhoto: !!booking.vehicle_photo,
            paymentConfirmed: true
          };

          if (String(booking.previous_payment_status || '').toLowerCase() !== 'paid') {
            await sendBookingConfirmation(paidBookingEmailData);
            await sendOwnerNotification(paidBookingEmailData);
            console.log('[Stripe Webhook] Customer confirmation and owner notification emails sent');
          } else {
            console.log('[Stripe Webhook] Booking was already marked paid; skipping duplicate emails');
          }
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
app.get('/api/payment-status/booking', async (req, res) => {
  try {
    const { sessionId } = req.query;
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID is required' });
    }

    const result = await pool.query(
      `SELECT id, booking_date, booking_time, service_type, payment_status, stripe_session_id
       FROM bookings WHERE stripe_session_id = $1 LIMIT 1`,
      [sessionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = result.rows[0];
    let sessionStatus = null;

    try {
      const session = await retrieveSession(sessionId);
      sessionStatus = session.payment_status;
    } catch (stripeError) {
      console.error('[Payment Status] Error retrieving Stripe session:', stripeError.message);
    }

    res.json({
      paymentStatus: sessionStatus === 'paid' ? 'paid' : booking.payment_status,
      sessionStatus,
      bookingId: booking.id,
      bookingDate: booking.booking_date,
      bookingTime: booking.booking_time,
      service: booking.service_type,
    });
  } catch (error) {
    console.error('[Payment Status] Session lookup error:', error.message);
    res.status(500).json({ error: 'Failed to get payment status' });
  }
});

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
app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/maintenance', maintenanceRoutes);

// Test endpoint to verify deployment
app.get('/api/test-deployment', (req, res) => {
  res.json({ message: 'Deployment test - this should be visible if new code is deployed', timestamp: new Date().toISOString() });
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
app.get('/api/owner/bookings', verifyToken, requireRole(['owner', 'dev']), async (req, res) => {
  try {
    await pool.query(
      `UPDATE bookings
       SET status = 'confirmed', updated_at = CURRENT_TIMESTAMP
       WHERE status = 'pending'
       AND payment_status IN ('paid', 'pay_later')
       AND NOT (
         customer_email = 'booking.test@gmail.com'
         AND customer_name = 'Available Slot'
       )`
    );

    const result = await pool.query(
      `SELECT * FROM bookings
       WHERE NOT (
         customer_email = 'booking.test@gmail.com'
         AND customer_name = 'Available Slot'
       )
       AND (
         status IN ('confirmed', 'paid', 'completed')
         OR payment_status IN ('paid', 'pay_later')
       )
       ORDER BY booking_date ASC, booking_time ASC`
    );
    res.json({ bookings: result.rows });
  } catch (error) {
    console.error('Error fetching bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Confirm booking
app.post('/api/owner/booking/:id/confirm', verifyToken, requireRole(['owner', 'dev']), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'UPDATE bookings SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      ['confirmed', id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    res.json({ success: true, booking: result.rows[0] });
  } catch (error) {
    console.error('Error confirming booking:', error);
    res.status(500).json({ error: 'Failed to confirm booking' });
  }
});

// Mark booking completed
app.post('/api/owner/booking/:id/complete', verifyToken, requireRole(['owner', 'dev']), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'UPDATE bookings SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      ['completed', id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    res.json({ success: true, booking: result.rows[0] });
  } catch (error) {
    console.error('Error completing booking:', error);
    res.status(500).json({ error: 'Failed to complete booking' });
  }
});

// Cancel booking
app.post('/api/owner/booking/:id/cancel', verifyToken, requireRole(['owner', 'dev']), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'UPDATE bookings SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      ['cancelled', id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    res.json({ success: true, booking: result.rows[0] });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
});

// Delete booking
app.delete('/api/owner/booking/:id', verifyToken, requireRole(['owner', 'dev']), async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'DELETE FROM bookings WHERE id = $1 RETURNING *',
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting booking:', error);
    res.status(500).json({ error: 'Failed to delete booking' });
  }
});

// Get schedule
app.get('/api/owner/schedule', verifyToken, requireRole(['owner', 'dev']), async (req, res) => {
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
app.post('/api/owner/schedule-day', verifyToken, requireRole(['owner', 'dev']), async (req, res) => {
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
app.get('/api/owner/blocked-dates', verifyToken, requireRole(['owner', 'dev']), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, to_char(blocked_date, 'YYYY-MM-DD') AS blocked_date, blocked_time, reason, created_at
       FROM blocked_dates
       ORDER BY blocked_date DESC, blocked_time NULLS FIRST`
    );
    res.json({ blockedDates: result.rows });
  } catch (error) {
    console.error('Error fetching blocked dates:', error);
    res.status(500).json({ error: 'Failed to fetch blocked dates' });
  }
});

// Block date
app.post('/api/owner/block-date', verifyToken, requireRole(['owner', 'dev']), async (req, res) => {
  try {
    const { blockedDate, blockedTime, startTime, endTime, reason } = req.body;
    if (!blockedDate) {
      return res.status(400).json({ error: 'Date is required' });
    }

    const toDisplayTime = (hour) => {
      const ampm = hour >= 12 ? 'PM' : 'AM';
      const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
      return `${displayHour}:00 ${ampm}`;
    };

    const timeToHour = (value) => {
      if (!value) return null;
      const [hour] = String(value).split(':');
      const parsed = parseInt(hour, 10);
      return Number.isFinite(parsed) ? parsed : null;
    };

    const blocks = [];
    if (startTime && endTime) {
      const startHour = timeToHour(startTime);
      const endHour = timeToHour(endTime);
      if (startHour === null || endHour === null || endHour <= startHour) {
        return res.status(400).json({ error: 'End time must be after start time' });
      }
      for (let hour = startHour; hour < endHour; hour += 1) {
        blocks.push(toDisplayTime(hour));
      }
    } else if (blockedTime) {
      blocks.push(blockedTime);
    }

    if (blocks.length === 0) {
      await pool.query(
        `DELETE FROM blocked_dates
         WHERE blocked_date::date = $1::date`,
        [blockedDate]
      );
      const result = await pool.query(
        `INSERT INTO blocked_dates (blocked_date, blocked_time, reason)
         VALUES ($1, NULL, $2)
         RETURNING *`,
        [blockedDate, reason || null]
      );
      return res.json({ success: true, blockedDates: result.rows });
    }

    const inserted = [];
    await pool.query(
      `DELETE FROM blocked_dates
       WHERE blocked_date::date = $1::date
       AND blocked_time IS NULL`,
      [blockedDate]
    );
    for (const time of blocks) {
      const result = await pool.query(
        `INSERT INTO blocked_dates (blocked_date, blocked_time, reason)
         VALUES ($1, $2, $3)
         ON CONFLICT (blocked_date, blocked_time)
         DO UPDATE SET reason = EXCLUDED.reason
         RETURNING *`,
        [blockedDate, time, reason || null]
      );
      inserted.push(result.rows[0]);
    }
    res.json({ success: true, blockedDates: inserted });
  } catch (error) {
    console.error('Error blocking date:', error);
    res.status(500).json({ error: 'Failed to block date' });
  }
});

// Unblock date
app.delete('/api/owner/blocked-date/:id', verifyToken, requireRole(['owner', 'dev']), async (req, res) => {
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

// Admin: Clear placeholder/test availability rows. Real availability is
// calculated by the schedule page; bookings table stores customer bookings only.
app.post('/api/admin/reset-availability', verifyToken, requireRole(['owner', 'dev']), async (req, res) => {
  try {
    console.log('[Admin Reset] Removing placeholder availability rows...');
    const result = await pool.query(
      `DELETE FROM bookings
       WHERE customer_email = $1
       AND customer_name = $2
       RETURNING id`,
      ['booking.test@gmail.com', 'Available Slot']
    );

    res.json({
      success: true,
      message: `Removed ${result.rowCount} placeholder rows.`,
      details: 'No availability slots were generated. Customer bookings are created only when someone books a day and time.'
    });
  } catch (error) {
    console.error('[Admin Reset] Error:', error.message);
    res.status(500).json({
      success: false,
      error: 'Failed to reset availability: ' + error.message
    });
  }
});

// Static file serving - AFTER all routes so routes take priority
// No caching (maxAge removed) - cache headers are set by middleware above
app.use(express.static(path.join(__dirname), {
  etag: false  // Disable etag to force revalidation
}));

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
// Remove legacy placeholder rows. Availability is calculated in the calendar;
// the bookings table should contain real customer bookings only.
async function cleanupPlaceholderBookings() {
  try {
    const result = await pool.query(
      `DELETE FROM bookings
       WHERE customer_email = $1
       AND customer_name = $2`,
      ['booking.test@gmail.com', 'Available Slot']
    );
    console.log(`[Startup] Removed ${result.rowCount} legacy placeholder rows`);
  } catch (error) {
    console.error('[Startup] Warning: Failed to remove placeholder rows:', error.message);
  }
}

async function restoreKnownPaidBookings() {
  const restoreId = 'restore-paid-bookings-2026-05-16-erik-nick-v2-email-preserve';
  const paidBookings = [
    {
      id: '11111111-0516-2026-0000-000000000001',
      customerName: 'Erik Colon',
      fallbackEmail: 'erik.colon.restored@gerusodetailing.com',
      customerPhone: '6176378044',
      serviceAddress: '313 Lynne Lane, Mapleville, Rhode Island 02938',
      serviceType: 'Ultra Premium + Full Vehicle Polish',
      bookingDate: '2026-05-16',
      bookingTime: '12:00 PM',
      vehicleType: 'Car',
      notes: 'Restored paid Stripe booking from May 16 admin record.',
      stripeSessionId: 'restored-paid-erik-colon-2026-05-16-1200'
    },
    {
      id: '11111111-0517-2026-0000-000000000002',
      customerName: 'Erik Colon',
      fallbackEmail: 'erik.colon.restored@gerusodetailing.com',
      customerPhone: '6176378044',
      serviceAddress: '313 Lynne Lane, Mapleville, Rhode Island 02938',
      serviceType: 'Full Vehicle Polish + Ultra Premium',
      bookingDate: '2026-05-17',
      bookingTime: '12:00 PM',
      vehicleType: 'Car',
      notes: 'Restored paid Stripe booking from May 17 admin record.',
      stripeSessionId: 'restored-paid-erik-colon-2026-05-17-1200'
    },
    {
      id: '11111111-0529-2026-0000-000000000003',
      customerName: 'Nick Winn',
      fallbackEmail: 'nick.winn.restored@gerusodetailing.com',
      customerPhone: '4014811943',
      serviceAddress: '33 Briar Hill Dr',
      serviceType: 'Premium Package + Ultra Premium',
      bookingDate: '2026-05-29',
      bookingTime: '12:00 PM',
      vehicleType: 'Car',
      notes: 'Restored paid Stripe booking from May 29 admin record. Combined matching same-time services into one booking.',
      stripeSessionId: 'restored-paid-nick-winn-2026-05-29-1200'
    }
  ];

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS data_restores (
        id VARCHAR(120) PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const existingRestore = await pool.query('SELECT id FROM data_restores WHERE id = $1', [restoreId]);
    if (existingRestore.rowCount > 0) {
      console.log('[Startup] Paid booking restore already applied:', restoreId);
      return;
    }

    await pool.query('BEGIN');

    for (const booking of paidBookings) {
      const compactTime = booking.bookingTime.replace(':00 ', ' ');
      const emailLookup = await pool.query(
        `SELECT customer_email
         FROM bookings
         WHERE (
           (booking_date::date = $1::date AND (booking_time = $2 OR booking_time = $3))
           OR regexp_replace(COALESCE(customer_phone, ''), '\\D', '', 'g') = $4
           OR lower(customer_name) = lower($5)
         )
         AND customer_email IS NOT NULL
         AND customer_email <> ''
         AND customer_email NOT ILIKE '%restored@gerusodetailing.com'
         ORDER BY
           CASE WHEN booking_date::date = $1::date AND (booking_time = $2 OR booking_time = $3) THEN 0 ELSE 1 END,
           updated_at DESC
         LIMIT 1`,
        [
          booking.bookingDate,
          booking.bookingTime,
          compactTime,
          String(booking.customerPhone || '').replace(/\D/g, ''),
          booking.customerName
        ]
      );
      const customerEmail = emailLookup.rows[0]?.customer_email || booking.fallbackEmail;

      await pool.query(
        `DELETE FROM bookings
         WHERE booking_date::date = $1::date
         AND (booking_time = $2 OR booking_time = $3)`,
        [booking.bookingDate, booking.bookingTime, compactTime]
      );

      await pool.query(
        `INSERT INTO bookings (
          id,
          customer_name,
          customer_email,
          customer_phone,
          service_address,
          service_type,
          booking_date,
          booking_time,
          vehicle_type,
          notes,
          status,
          payment_status,
          stripe_session_id,
          stripe_payment_intent_id,
          deposit_amount,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::date, $8, $9, $10, 'confirmed', 'paid', $11, $12, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (id)
        DO UPDATE SET
          customer_name = EXCLUDED.customer_name,
          customer_email = EXCLUDED.customer_email,
          customer_phone = EXCLUDED.customer_phone,
          service_address = EXCLUDED.service_address,
          service_type = EXCLUDED.service_type,
          vehicle_type = EXCLUDED.vehicle_type,
          notes = EXCLUDED.notes,
          status = 'confirmed',
          payment_status = 'paid',
          stripe_session_id = EXCLUDED.stripe_session_id,
          stripe_payment_intent_id = EXCLUDED.stripe_payment_intent_id,
          deposit_amount = EXCLUDED.deposit_amount,
          updated_at = CURRENT_TIMESTAMP`,
        [
          booking.id,
          booking.customerName,
          customerEmail,
          booking.customerPhone,
          booking.serviceAddress,
          booking.serviceType,
          booking.bookingDate,
          booking.bookingTime,
          booking.vehicleType,
          booking.notes,
          booking.stripeSessionId,
          `restored-${booking.id}`
        ]
      );
    }

    await pool.query(
      `INSERT INTO data_restores (id, applied_at)
       VALUES ($1, CURRENT_TIMESTAMP)
       ON CONFLICT (id) DO NOTHING`,
      [restoreId]
    );
    await pool.query('COMMIT');

    console.log('[Startup] Restored paid bookings for Erik Colon and Nick Winn');
  } catch (error) {
    try {
      await pool.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('[Startup] Warning: Paid booking restore rollback failed:', rollbackError.message);
    }
    console.error('[Startup] Warning: Failed to restore paid bookings:', error.message);
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

  await cleanupPlaceholderBookings();
  await restoreKnownPaidBookings();

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
