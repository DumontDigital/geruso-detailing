const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const { sendBookingConfirmation, sendOwnerNotification } = require('../email');
const { verifyToken } = require('../middleware/auth');
const { createCheckoutSession } = require('../stripe');

const router = express.Router();

// Get booked time slots (public endpoint - no auth required)
// Only count REAL customer bookings: pending, confirmed, paid
// EXCLUDE: placeholder rows, cancelled, deleted, failed, expired
router.get('/public/booked-slots', async (req, res) => {
  try {
    console.log('[Bookings API] GET /public/booked-slots called');

    const result = await pool.query(
      `SELECT booking_date, booking_time, service_type, service_address FROM bookings
       WHERE status IN ('pending', 'confirmed', 'paid', 'completed')
       AND NOT (customer_name = 'Available Slot' AND customer_email = 'booking.test@gmail.com')`,
      []
    );
    const blockedResult = await pool.query(
      `SELECT blocked_date, blocked_time FROM blocked_dates`,
      []
    );

    // Transform results into a map for easy lookup: { 'YYYY-MM-DD HH:MM': true }
    const bookedSlots = {};
    const blockedDates = {};
    result.rows.forEach(booking => {
      // booking_date is already in YYYY-MM-DD format from database, don't convert
      const dateStr = booking.booking_date.toString().split('T')[0]; // Handle both string and date types from DB
      const bookingTime = normalizeBookingTime(booking.booking_time);
      if (!bookingTime) return;
      const key = `${dateStr} ${bookingTime}`;
      bookedSlots[key] = true;
      const serviceType = String(booking.service_type || '');
      if (isLongDetailService(serviceType)) {
        getBlockedSlotsForLongDetail(bookingTime).forEach(time => {
          bookedSlots[`${dateStr} ${time}`] = true;
        });
      }
      console.log('[Bookings API] Real customer booked slot:', key);
    });
    blockedResult.rows.forEach(block => {
      const dateStr = block.blocked_date.toString().split('T')[0];
      if (block.blocked_time) {
        const blockedTime = normalizeBookingTime(block.blocked_time);
        if (blockedTime) bookedSlots[`${dateStr} ${blockedTime}`] = true;
      } else {
        blockedDates[dateStr] = true;
      }
    });

    console.log('[Bookings API] Returning', result.rows.length, 'real customer booked slots (excluding',
      result.rowCount > 0 ? 'any placeholders' : 'placeholders', ')');
    res.json({ bookedSlots, blockedDates });
  } catch (error) {
    console.error('[Bookings API] Error fetching booked slots:', error.message);
    res.status(500).json({ error: 'Failed to fetch available slots' });
  }
});

async function isSlotBlocked(bookingDate, bookingTime) {
  const normalizedBookingTime = normalizeBookingTime(bookingTime);
  const result = await pool.query(
    `SELECT id, blocked_time FROM blocked_dates
     WHERE blocked_date::date = $1::date
     AND (blocked_time IS NULL OR blocked_time = $2 OR blocked_time = $3)`,
    [bookingDate, bookingTime, normalizedBookingTime]
  );
  return result.rows.some(row => !row.blocked_time || normalizeBookingTime(row.blocked_time) === normalizedBookingTime);
}

function isLongDetailService(serviceType) {
  return /(Ceramic Coating|Full Vehicle Polish)/i.test(String(serviceType || ''));
}

function getLongDetailStartTimesForDay(dayOfWeek) {
  if (['Thu', 'Fri'].includes(dayOfWeek)) return ['12:00 PM', '1:00 PM'];
  if (['Sat', 'Sun'].includes(dayOfWeek)) return ['6:30 AM', '7:30 AM'];
  return [];
}

function getBookingDayOfWeek(bookingDate) {
  const [year, month, day] = String(bookingDate || '').split('-').map(Number);
  if (!year || !month || !day) return '';
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

function inferServiceMode(serviceLocation, serviceAddress) {
  const locationValue = String(serviceLocation || '').toLowerCase();
  if (locationValue.includes('geruso') || locationValue.includes('location')) return 'location';
  if (locationValue.includes('mobile')) return 'mobile';

  return /313\s+Lynne\s+Lane|Mapleville/i.test(String(serviceAddress || ''))
    ? 'location'
    : 'mobile';
}

function enforceServiceDayRules({ bookingDate, serviceLocation, serviceAddress }) {
  const dayOfWeek = getBookingDayOfWeek(bookingDate);
  const mode = inferServiceMode(serviceLocation, serviceAddress);

  if (mode === 'mobile' && !['Thu', 'Fri'].includes(dayOfWeek)) {
    return 'Mobile appointments are available Thursday and Friday only.';
  }

  if (mode === 'location' && !['Sat', 'Sun'].includes(dayOfWeek)) {
    return 'Geruso Location appointments are available Saturday and Sunday only.';
  }

  return '';
}

function parseBookingMinutes(timeString) {
  const raw = String(timeString || '').trim();
  const twentyFourHourMatch = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (twentyFourHourMatch) {
    const hour = Number.parseInt(twentyFourHourMatch[1], 10);
    const minute = Number.parseInt(twentyFourHourMatch[2], 10);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return (hour * 60) + minute;
    }
  }

  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!match) return null;

  let hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2] || '0', 10);
  const period = match[3].toUpperCase();
  if (period === 'PM' && hour !== 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;
  return (hour * 60) + minute;
}

function formatBookingMinutes(totalMinutes) {
  const hour = Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour > 12 ? hour - 12 : (hour === 0 ? 12 : hour);
  return `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;
}

function normalizeBookingTime(timeString) {
  const minutes = parseBookingMinutes(timeString);
  return minutes === null ? String(timeString || '').trim() : formatBookingMinutes(minutes);
}

function getSixHourBlockFromTime(timeString) {
  const startMinutes = parseBookingMinutes(timeString);
  if (startMinutes === null) return [];
  return Array.from({ length: 6 }, (_, index) => formatBookingMinutes(startMinutes + (index * 60)));
}

function getAppointmentInterval(timeString, durationMinutes) {
  const startMinutes = parseBookingMinutes(timeString);
  if (startMinutes === null) return null;
  return {
    start: startMinutes,
    end: startMinutes + durationMinutes
  };
}

function timeIntervalsOverlap(firstInterval, secondInterval) {
  if (!firstInterval || !secondInterval) return false;
  return firstInterval.start < secondInterval.end && secondInterval.start < firstInterval.end;
}

function getBlockedSlotsForLongDetail(timeString) {
  const longInterval = getAppointmentInterval(timeString, 360);
  const candidateSlots = [
    '6:00 AM',
    '6:30 AM',
    '7:00 AM',
    '7:30 AM',
    '8:00 AM',
    '9:00 AM',
    '10:00 AM',
    '11:00 AM',
    '12:00 PM',
    '1:00 PM',
    '2:00 PM',
    '3:00 PM',
    '4:00 PM',
    '5:00 PM',
    '6:00 PM',
  ];

  return candidateSlots.filter(slot => timeIntervalsOverlap(
    longInterval,
    getAppointmentInterval(slot, 60)
  ));
}

async function getActiveBookingsForDate(bookingDate) {
  const result = await pool.query(
    `SELECT id, booking_time, service_type FROM bookings
     WHERE booking_date::date = $1::date
     AND status IN ('pending', 'confirmed', 'paid', 'completed')
     AND NOT (customer_name = 'Available Slot' AND customer_email = 'booking.test@gmail.com')`,
    [bookingDate]
  );
  return result.rows;
}

async function enforceLongDetailRules({ bookingDate, bookingTime, serviceType }) {
  const isLongDetail = isLongDetailService(serviceType);
  const dayOfWeek = getBookingDayOfWeek(bookingDate);
  const allowedLongStarts = getLongDetailStartTimesForDay(dayOfWeek);
  const normalizedBookingTime = normalizeBookingTime(bookingTime);

  if (isLongDetail && !allowedLongStarts.includes(normalizedBookingTime)) {
    return ['Sat', 'Sun'].includes(dayOfWeek)
      ? 'Ceramic Coating and Full Vehicle Polish weekend appointments can only start at 6:30 AM or 7:30 AM.'
      : 'Ceramic Coating and Full Vehicle Polish weekday appointments can only start at 12:00 PM or 1:00 PM.';
  }

  const requestedInterval = getAppointmentInterval(normalizedBookingTime, isLongDetail ? 360 : 60);
  const activeBookings = await getActiveBookingsForDate(bookingDate);

  for (const booking of activeBookings) {
    const existingIsLongDetail = isLongDetailService(booking.service_type);
    const existingInterval = getAppointmentInterval(normalizeBookingTime(booking.booking_time), existingIsLongDetail ? 360 : 60);

    if (timeIntervalsOverlap(requestedInterval, existingInterval)) {
      return isLongDetail || existingIsLongDetail
        ? 'This time overlaps a 6-hour Ceramic Coating or Full Vehicle Polish appointment. Please choose another time.'
        : 'This time was just booked. Please choose another slot.';
    }
  }

  return '';
}

// Create Stripe checkout session for booking (public)
// Allows booking even without Stripe - will show message if Stripe not configured
router.post('/checkout', async (req, res) => {
  try {
    console.log('[Bookings API] POST /checkout called');
    console.log('[Bookings API] Request body:', JSON.stringify(req.body, null, 2));

    const { customerName, customerEmail, customerPhone, serviceAddress, serviceType, bookingDate, bookingTime, vehicleType, notes, vehiclePhoto, serviceLocation } = req.body;

    // Validate required fields
    if (!customerName || !customerEmail || !customerPhone || !serviceAddress || !serviceType || !bookingDate || !bookingTime) {
      console.warn('[Bookings API] Validation failed - Missing required fields');
      return res.status(400).json({ error: 'All required fields must be filled' });
    }

    console.log('[Bookings API] Validation passed');
    const normalizedBookingTime = normalizeBookingTime(bookingTime);

    const serviceDayError = enforceServiceDayRules({ bookingDate, serviceLocation, serviceAddress });
    if (serviceDayError) {
      return res.status(409).json({
        error: serviceDayError,
        code: 'SERVICE_DAY_UNAVAILABLE'
      });
    }

    if (await isSlotBlocked(bookingDate, normalizedBookingTime)) {
      return res.status(409).json({
        error: 'This time is blocked by Geruso Detailing. Please choose another slot.',
        code: 'TIME_SLOT_BLOCKED'
      });
    }

    const longDetailRuleError = await enforceLongDetailRules({ bookingDate, bookingTime: normalizedBookingTime, serviceType });
    if (longDetailRuleError) {
      return res.status(409).json({
        error: longDetailRuleError,
        code: 'LONG_DETAIL_TIME_BLOCKED'
      });
    }

    await pool.query(
      `DELETE FROM bookings
       WHERE booking_date::date = $1::date
       AND booking_time = $2
       AND customer_email = $3
       AND customer_name = $4`,
      [bookingDate, normalizedBookingTime, 'booking.test@gmail.com', 'Available Slot']
    );

    const bookingId = uuidv4();
    const result = await pool.query(
      `INSERT INTO bookings (id, customer_name, customer_email, customer_phone, service_address, service_type, booking_date, booking_time, vehicle_type, notes, vehicle_photo, status, payment_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [bookingId, customerName, customerEmail, customerPhone, serviceAddress, serviceType, bookingDate, normalizedBookingTime, vehicleType || null, notes || null, vehiclePhoto || null, 'pending', 'unpaid']
    );

    const booking = result.rows[0];
    console.log('[Bookings API] Real customer booking created:', booking.id);

    // Send confirmation email to customer
    console.log('[Bookings API] Sending confirmation email to:', customerEmail);
    const confirmationResult = await sendBookingConfirmation({
      customerName,
      customerEmail,
      bookingDate,
      bookingTime: normalizedBookingTime,
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
      bookingTime: normalizedBookingTime,
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
          [stripeSession.id, booking.id]
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

    const { customerName, customerEmail, customerPhone, serviceAddress, serviceType, bookingDate, bookingTime, vehicleType, notes, vehiclePhoto, serviceLocation } = req.body;

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
    const normalizedBookingTime = normalizeBookingTime(bookingTime);

    const serviceDayError = enforceServiceDayRules({ bookingDate, serviceLocation, serviceAddress });
    if (serviceDayError) {
      return res.status(409).json({
        error: serviceDayError,
        code: 'SERVICE_DAY_UNAVAILABLE'
      });
    }

    if (await isSlotBlocked(bookingDate, normalizedBookingTime)) {
      return res.status(409).json({
        error: 'This time is blocked by Geruso Detailing. Please choose another slot.',
        code: 'TIME_SLOT_BLOCKED'
      });
    }

    const longDetailRuleError = await enforceLongDetailRules({ bookingDate, bookingTime: normalizedBookingTime, serviceType });
    if (longDetailRuleError) {
      return res.status(409).json({
        error: longDetailRuleError,
        code: 'LONG_DETAIL_TIME_BLOCKED'
      });
    }

    // Insert booking
    const bookingId = uuidv4();
    const result = await pool.query(
      `INSERT INTO bookings (id, customer_name, customer_email, customer_phone, service_address, service_type, booking_date, booking_time, vehicle_type, notes, vehicle_photo, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [bookingId, customerName, customerEmail, customerPhone, serviceAddress, serviceType, bookingDate, normalizedBookingTime, vehicleType, notes, vehiclePhoto || null, 'pending']
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

// Get all bookings (admin only) - DEPRECATED, use /api/admin/bookings instead
// Kept for backward compatibility but returns FILTERED data (no May 1)
router.get('/', verifyToken, async (req, res) => {
  try {
    const { getTodayInEasternTime } = require('../utils/availability');
    const today = getTodayInEasternTime();

    // CRITICAL: Filter out past dates and May 1 - NEVER return old data
    const result = await pool.query(
      'SELECT * FROM bookings WHERE booking_date::date >= $1::date ORDER BY booking_date ASC, booking_time ASC',
      [today]
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

// Cancel booking (admin only). The slot reopens because cancelled bookings
// are ignored by the public booked-slots endpoint.
router.post('/:id/cancel', verifyToken, async (req, res) => {
  try {
    console.log('[Bookings API] POST /:id/cancel called for booking:', req.params.id);

    const result = await pool.query(
      `UPDATE bookings
       SET status = $1,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      ['cancelled', req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    const booking = result.rows[0];
    console.log('[Bookings API] Booking cancelled:', booking.id);

    res.json({
      success: true,
      message: 'Booking cancelled',
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
