const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const { sendBookingConfirmation } = require('../email');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// Create booking (public)
router.post('/', async (req, res) => {
  try {
    const { customerName, customerEmail, customerPhone, serviceType, bookingDate, bookingTime, vehicleType, notes } = req.body;

    // Validate required fields
    if (!customerName || !customerEmail || !customerPhone || !serviceType || !bookingDate || !bookingTime) {
      return res.status(400).json({ error: 'All required fields must be filled' });
    }

    // Insert booking
    const bookingId = uuidv4();
    const result = await pool.query(
      `INSERT INTO bookings (id, customer_name, customer_email, customer_phone, service_type, booking_date, booking_time, vehicle_type, notes, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [bookingId, customerName, customerEmail, customerPhone, serviceType, bookingDate, bookingTime, vehicleType, notes, 'pending']
    );

    const booking = result.rows[0];

    // Extract price from service type string if it exists
    const priceMatch = serviceType.match(/\$(\d+)/);
    const price = priceMatch ? priceMatch[1] : '0';

    // Send confirmation email to customer
    const emailResult = await sendBookingConfirmation({
      customerName,
      customerEmail,
      bookingDate,
      bookingTime,
      serviceType,
      price
    });

    if (!emailResult.success) {
      console.error('Failed to send booking confirmation email:', emailResult.error);
      // Don't fail the booking if email fails, but log it
    }

    res.json({
      success: true,
      message: 'Booking confirmed! Check your email for details.',
      booking
    });
  } catch (error) {
    console.error('Booking creation error:', error);
    res.status(500).json({ error: 'Failed to create booking' });
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

module.exports = router;
