const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const { sendBookingConfirmation, sendOwnerNotification } = require('../email');
const { verifyToken } = require('../middleware/auth');
const { createCheckoutSession } = require('../stripe');

const router = express.Router();

// Get booked time slots (public endpoint - no auth required)
// Only count active bookings: pending, confirmed, paid
// Exclude: cancelled, deleted, failed, expired
router.get('/public/booked-slots', async (req, res) => {
  try {
    console.log('[Bookings API] GET /public/booked-slots called');

    const result = await pool.query(
      "SELECT booking_date, booking_time FROM bookings WHERE status IN ('pending', 'confirmed', 'paid')",
      []
    );

    // Transform results into a map for easy lookup: { 'YYYY-MM-DD HH:MM': true }
    const bookedSlots = {};
    result.rows.forEach(booking => {
      // Format date as ISO string (YYYY-MM-DD) to match frontend format
      const dateStr = new Date(booking.booking_date).toISOString().split('T')[0];
      const key = `${dateStr} ${booking.booking_time}`;
      bookedSlots[key] = true;
      console.log('[Bookings API] Active booked slot:', key);
    });

    console.log('[Bookings API] Returning', result.rows.length, 'active booked slots');
    res.json({ bookedSlots });
  } catch (error) {
    console.error('[Bookings API] Error fetching booked slots:', error.message);
    res.status(500).json({ error: 'Failed to fetch available slots' });
  }
});

// Create Stripe checkout session for booking (public)
// Allows booking even without Stripe - will show message if Stripe not configured
router.post('/checkout', async (req, res) => {
  try {
    console.log('[Bookings API] POST /checkout called');
    console.log('[Bookings API] Request body:', JSON.stringify(req.body, null, 2));

    const { customerName, customerEmail, customerPhone, serviceAddress, serviceType, bookingDate, bookingTime, vehicleType, notes, vehiclePhoto } = req.body;

    // Validate required fields
    if (!customerName || !customerEmail || !customerPhone || !serviceAddress || !serviceType || !bookingDate || !bookingTime) {
      console.warn('[Bookings API] Validation failed - Missing required fields');
      return res.status(400).json({ error: 'All required fields must be filled' });
    }

    console.log('[Bookings API] Validation passed');

    // Try to find and replace an existing placeholder at this date/time
    const placeholderQuery = await pool.query(
      `SELECT id FROM bookings WHERE booking_date::text = $1 AND booking_time = $2 AND customer_email = $3 AND customer_name = $4 LIMIT 1`,
      [bookingDate, bookingTime, 'booking.test@gmail.com', 'Available Slot']
    );

    let booking;

    if (placeholderQuery.rows.length > 0) {
      // Update existing placeholder
      const placeholderId = placeholderQuery.rows[0].id;
      console.log('[Bookings API] Replacing placeholder:', placeholderId);

      const result = await pool.query(
        `UPDATE bookings SET customer_name = $1, customer_email = $2, customer_phone = $3, service_address = $4, service_type = $5, vehicle_type = $6, notes = $7, vehicle_photo = $8, status = $9, payment_status = $10, updated_at = CURRENT_TIMESTAMP
         WHERE id = $11
         RETURNING *`,
        [customerName, customerEmail, customerPhone, serviceAddress, serviceType, vehicleType || null, notes || null, vehiclePhoto || null, 'pending', 'unpaid', placeholderId]
      );

      booking = result.rows[0];
      console.log('[Bookings API] Placeholder replaced with real customer data:', booking.id);
    } else {
      // Create new booking if placeholder doesn't exist
      const bookingId = uuidv4();
      console.log('[Bookings API] No placeholder found, creating new booking');

      const result = await pool.query(
        `INSERT INTO bookings (id, customer_name, customer_email, customer_phone, service_address, service_type, booking_date, booking_time, vehicle_type, notes, vehicle_photo, status, payment_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [bookingId, customerName, customerEmail, customerPhone, serviceAddress, serviceType, bookingDate, bookingTime, vehicleType || null, notes || null, vehiclePhoto || null, 'pending', 'unpaid']
      );

      booking = result.rows[0];
      console.log('[Bookings API] Booking created (unpaid):', booking.id);
    }

    // Send confirmation email to customer
    console.log('[Bookings API] Sending confirmation email to:', customerEmail);
    const confirmationResult = await sendBookingConfirmation({
      customerName,
      customerEmail,
      bookingDate,
      bookingTime,
      serviceType,
      serviceAddress,
      hasPhoto: !!vehiclePhoto
    });

    if (!confirmationResult.success) {
      console.error('[Bookings API] Failed to send booking confirmation email:', confirmationResult.error);
    } else {
      console.log('[Bookings API] Confirmation email sent successfully');
    }

    // Send owner/admin notification email
    console.log('[Bookings API] Sending owner notification email');
    const ownerResult = await sendOwnerNotification({
      customerName,
      customerEmail,
      customerPhone,
      bookingDate,
      bookingTime,
      serviceType,
      serviceAddress,
      vehicleType,
      notes,
      hasPhoto: !!vehiclePhoto
    });

    if (!ownerResult.success) {
      console.error('[Bookings API] Failed to send owner notification email:', ownerResult.error);
    } else {
      console.log('[Bookings API] Owner notification email sent successfully');
    }

    // Check if Stripe is configured
    const stripeConfigured = process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET;

    if (stripeConfigured) {
      console.log('[Bookings API] Stripe is configured, creating checkout session...');
      try {
        // Create Stripe checkout session
        const stripeSession = await createCheckoutSession(booking);

        // Update booking with Stripe session ID
        await pool.query(
          'UPDATE bookings SET stripe_session_id = $1 WHERE id = $2',
          [stripeSession.id, bookingId]
        );

        console.log('[Bookings API] Stripe session created:', stripeSession.id);

        // Return checkout URL for Stripe
        return res.json({
          success: true,
          checkoutUrl: stripeSession.url,
          bookingId: booking.id,
          message: 'Redirecting to payment...'
        });
      } catch (stripeError) {
        console.error('[Bookings API] Error creating Stripe session:', stripeError.message);
        // Fall through to return success with pending status
      }
    } else {
      console.log('[Bookings API] Stripe is NOT configured - booking saved as unpaid');
    }

    // Return success - booking is saved, Stripe is optional
    res.json({
      success: true,
      bookingId: booking.id,
      message: 'Booking request received. Payment is not connected yet.',
      stripeConfigured: false
    });

  } catch (error) {
    console.error('[Bookings API] Error creating booking:', error.message);

    // Handle unique constraint violation (double booking)
    if (error.code === '23505') {
      console.warn('[Bookings API] ⚠️ DOUBLE BOOKING ATTEMPT DETECTED!');
      return res.status(409).json({
        error: 'This time was just booked. Please choose another slot.',
        code: 'TIME_SLOT_TAKEN'
      });
    }

    res.status(500).json({ error: 'Failed to create booking: ' + error.message });
  }
});

// Create booking (public) - kept for backward compatibility
router.post('/', async (req, res) => {
  try {
    console.log('[Bookings API] POST / called');
    console.log('[Bookings API] Request body:', JSON.stringify(req.body, null, 2));

    const { customerName, customerEmail, customerPhone, serviceAddress, serviceType, bookingDate, bookingTime, vehicleType, notes, vehiclePhoto } = req.body;

    // Validate required fields
    if (!customerName || !customerEmail || !customerPhone || !serviceAddress || !serviceType || !bookingDate || !bookingTime) {
      console.warn('[Bookings API] Validation failed - Missing required fields');
      console.warn('[Bookings API] customerName:', customerName);
      console.warn('[Bookings API] customerEmail:', customerEmail);
      console.warn('[Bookings API] customerPhone:', customerPhone);
      console.warn('[Bookings API] serviceAddress:', serviceAddress);
      console.warn('[Bookings API] serviceType:', serviceType);
      console.warn('[Bookings API] bookingDate:', bookingDate);
      console.warn('[Bookings API] bookingTime:', bookingTime);
      return res.status(400).json({ error: 'All required fields must be filled' });
    }

    console.log('[Bookings API] Validation passed');

    // Insert booking
    const bookingId = uuidv4();
    const result = await pool.query(
      `INSERT INTO bookings (id, customer_name, customer_email, customer_phone, service_address, service_type, booking_date, booking_time, vehicle_type, notes, vehicle_photo, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [bookingId, customerName, customerEmail, customerPhone, serviceAddress, serviceType, bookingDate, bookingTime, vehicleType, notes, vehiclePhoto || null, 'pending']
    );

    const booking = result.rows[0];
    console.log('[Bookings API] Booking created successfully:', booking.id);

    // Send confirmation email to customer
    console.log('[Bookings API] Sending confirmation email to:', customerEmail);
    const confirmationResult = await sendBookingConfirmation({
      customerName,
      customerEmail,
      bookingDate,
      bookingTime,
      serviceType,
      serviceAddress,
      hasPhoto: !!vehiclePhoto // Flag indicating if photo was uploaded
    });

    if (!confirmationResult.success) {
      console.error('[Bookings API] Failed to send booking confirmation email:', confirmationResult.error);
      // Don't fail the booking if email fails, but log it
    } else {
      console.log('[Bookings API] Confirmation email sent successfully');
    }

    // Send owner/admin notification email
    console.log('[Bookings API] Sending owner notification email');
    const ownerResult = await sendOwnerNotification({
      customerName,
      customerEmail,
      customerPhone,
      bookingDate,
      bookingTime,
      serviceType,
      serviceAddress,
      vehicleType,
      notes,
      hasPhoto: !!vehiclePhoto
    });

    if (!ownerResult.success) {
      console.error('[Bookings API] Failed to send owner notification email:', ownerResult.error);
      // Don't fail the booking if email fails, but log it
    } else {
      console.log('[Bookings API] Owner notification email sent successfully');
    }

    console.log('[Bookings API] ✓ SUCCESS - Booking created and confirmed');
    console.log('[Bookings API] Booking details:', { bookingId: booking.id, bookingDate, bookingTime, customerEmail });

    res.json({
      success: true,
      message: 'Booking confirmed! Check your email for details.',
      booking
    });
  } catch (error) {
    console.error('[Bookings API] FATAL ERROR - Booking creation failed:', error.message);
    console.error('[Bookings API] Error code:', error.code);
    console.error('[Bookings API] Error constraint:', error.constraint);
    console.error('[Bookings API] Stack trace:', error.stack);

    // Handle unique constraint violation (double booking)
    if (error.code === '23505') {
      console.warn('[Bookings API] ⚠️ DOUBLE BOOKING ATTEMPT DETECTED!');
      console.warn('[Bookings API] Conflict - Date:', bookingDate, 'Time:', bookingTime);
      console.warn('[Bookings API] Attempted by:', customerEmail);
      console.warn('[Bookings API] Constraint:', error.constraint);

      return res.status(409).json({
        error: 'This time was just booked. Please choose another slot.',
        code: 'TIME_SLOT_TAKEN',
        conflictDate: bookingDate,
        conflictTime: bookingTime
      });
    }

    res.status(500).json({ error: 'Failed to create booking: ' + error.message });
  }
});

// Get all bookings (admin only)
router.get('/', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM bookings ORDER BY booking_date DESC, booking_time DESC'
    );
    res.json({ bookings: result.rows });
  } catch (error) {
    console.error('Fetch bookings error:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Get booking by ID (admin only)
router.get('/:id', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM bookings WHERE id = $1',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json({ booking: result.rows[0] });
  } catch (error) {
    console.error('Fetch booking error:', error);
    res.status(500).json({ error: 'Failed to fetch booking' });
  }
});

// Update booking (admin only)
router.put('/:id', verifyToken, async (req, res) => {
  try {
    const { customerName, customerEmail, customerPhone, status, notes } = req.body;

    const result = await pool.query(
      `UPDATE bookings SET customer_name = $1, customer_email = $2, customer_phone = $3, status = $4, notes = $5, updated_at = CURRENT_TIMESTAMP
       WHERE id = $6
       RETURNING *`,
      [customerName, customerEmail, customerPhone, status, notes, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json({ success: true, booking: result.rows[0] });
  } catch (error) {
    console.error('Update booking error:', error);
    res.status(500).json({ error: 'Failed to update booking' });
  }
});

// Delete booking (admin only)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM bookings WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json({ success: true, message: 'Booking deleted' });
  } catch (error) {
    console.error('Delete booking error:', error);
    res.status(500).json({ error: 'Failed to delete booking' });
  }
});

// Cancel booking (admin only) - reverts to placeholder
// This reopens the time slot by reverting to placeholder availability
router.post('/:id/cancel', verifyToken, async (req, res) => {
  try {
    console.log('[Bookings API] POST /:id/cancel called for booking:', req.params.id);

    // Check if this is a real booking (not already a placeholder)
    const bookingCheck = await pool.query(
      'SELECT customer_email, customer_name FROM bookings WHERE id = $1',
      [req.params.id]
    );

    if (bookingCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const isPlaceholder = bookingCheck.rows[0].customer_email === 'booking.test@gmail.com' && bookingCheck.rows[0].customer_name === 'Available Slot';

    // Revert to placeholder: replace customer info with placeholder data
    const result = await pool.query(
      `UPDATE bookings SET
        customer_name = $1,
        customer_email = $2,
        customer_phone = $3,
        service_address = $4,
        service_type = $5,
        vehicle_type = NULL,
        notes = NULL,
        vehicle_photo = NULL,
        status = $6,
        payment_status = $7,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING *`,
      ['Available Slot', 'booking.test@gmail.com', '401-123-4567', '123 Main St, Mapleville RI', 'Basic', 'pending', 'unpaid', req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = result.rows[0];
    console.log('[Bookings API] Booking cancelled and reverted to placeholder:', booking.id);
    console.log('[Bookings API] Slot reopened:', booking.booking_date, booking.booking_time);

    res.json({
      success: true,
      message: 'Booking cancelled and slot reopened',
      booking
    });
  } catch (error) {
    console.error('[Bookings API] Cancel booking error:', error);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
});

// Mark booking as paid (admin only)
// Sets payment_status to 'paid' and status to 'confirmed'
router.post('/:id/mark-paid', verifyToken, async (req, res) => {
  try {
    console.log('[Bookings API] POST /:id/mark-paid called for booking:', req.params.id);

    const result = await pool.query(
      `UPDATE bookings SET payment_status = $1, status = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      ['paid', 'confirmed', req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = result.rows[0];
    console.log('[Bookings API] Booking marked as paid:', booking.id);

    res.json({
      success: true,
      message: 'Booking marked as paid and confirmed',
      booking
    });
  } catch (error) {
    console.error('[Bookings API] Mark paid error:', error);
    res.status(500).json({ error: 'Failed to mark booking as paid' });
  }
});

// Mark booking as confirmed (admin only)
// Sets status to 'confirmed'
router.post('/:id/mark-confirmed', verifyToken, async (req, res) => {
  try {
    console.log('[Bookings API] POST /:id/mark-confirmed called for booking:', req.params.id);

    const result = await pool.query(
      `UPDATE bookings SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      ['confirmed', req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = result.rows[0];
    console.log('[Bookings API] Booking marked as confirmed:', booking.id);

    res.json({
      success: true,
      message: 'Booking marked as confirmed',
      booking
    });
  } catch (error) {
    console.error('[Bookings API] Mark confirmed error:', error);
    res.status(500).json({ error: 'Failed to mark booking as confirmed' });
  }
});

module.exports = router;
