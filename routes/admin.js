const express = require('express');
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');
const { getTodayInEasternTime } = require('../utils/availability');

const router = express.Router();

// Get dashboard stats (admin only)
router.get('/dashboard', verifyToken, async (req, res) => {
  try {
    // Use Eastern Time for dashboard stats
    const today = getTodayInEasternTime();

    // Calculate week ago in Eastern Time
    const [year, month, day] = today.split('-').map(Number);
    const weekAgoDate = new Date(year, month - 1, day - 7);
    const weekAgo = `${weekAgoDate.getFullYear()}-${String(weekAgoDate.getMonth() + 1).padStart(2, '0')}-${String(weekAgoDate.getDate()).padStart(2, '0')}`;

    // Today's bookings
    const todayResult = await pool.query(
      'SELECT COUNT(*) as count FROM bookings WHERE booking_date = $1',
      [today]
    );

    // This week's bookings
    const weekResult = await pool.query(
      'SELECT COUNT(*) as count FROM bookings WHERE booking_date BETWEEN $1 AND $2',
      [weekAgo, today]
    );

    // Pending confirmations
    const pendingResult = await pool.query(
      'SELECT COUNT(*) as count FROM bookings WHERE status = $1',
      ['pending']
    );

    // Calculate revenue from confirmed bookings
    const revenueResult = await pool.query(
      `SELECT SUM(CAST(SUBSTRING(service_type FROM '\\$(\\d+)') AS INTEGER)) as total
       FROM bookings
       WHERE status = $1 AND booking_date >= $2`,
      ['confirmed', weekAgo]
    );

    // Upcoming bookings next 7 days (in Eastern Time)
    const sevenDaysLater = new Date(year, month - 1, day + 7);
    const sevenDaysLaterStr = `${sevenDaysLater.getFullYear()}-${String(sevenDaysLater.getMonth() + 1).padStart(2, '0')}-${String(sevenDaysLater.getDate()).padStart(2, '0')}`;

    const upcomingResult = await pool.query(
      `SELECT * FROM bookings
       WHERE booking_date BETWEEN $1 AND $2
       ORDER BY booking_date ASC, booking_time ASC
       LIMIT 10`,
      [today, sevenDaysLaterStr]
    );

    res.json({
      todayCount: parseInt(todayResult.rows[0].count),
      weekCount: parseInt(weekResult.rows[0].count),
      pendingCount: parseInt(pendingResult.rows[0].count),
      revenue: revenueResult.rows[0].total || 0,
      upcomingBookings: upcomingResult.rows
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

// Get all bookings (admin only)
router.get('/bookings', verifyToken, async (req, res) => {
  try {
    const { status, search } = req.query;

    // Get today's date in Eastern Time to filter out past dates
    const today = getTodayInEasternTime();

    let query = 'SELECT * FROM bookings WHERE booking_date::date >= $1::date';
    const params = [today];
    let paramIndex = 2;

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (search) {
      query += ` AND (customer_name ILIKE '%' || $${paramIndex} || '%' OR customer_email ILIKE '%' || $${paramIndex} || '%')`;
      params.push(search);
    }

    // Sort by date ascending only - frontend will handle time sorting numerically
    query += ' ORDER BY booking_date ASC';

    const result = await pool.query(query, params);

    // Mark placeholder bookings
    const bookings = result.rows.map(booking => ({
      ...booking,
      is_placeholder: booking.customer_email === 'booking.test@gmail.com' && booking.customer_name === 'Available Slot'
    }));

    res.json({ bookings });
  } catch (error) {
    console.error('Fetch admin bookings error:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// Cleanup old placeholder bookings before today (admin only)
router.post('/cleanup-old-placeholders', verifyToken, async (req, res) => {
  try {
    console.log('[Cleanup] Starting cleanup of old placeholder bookings...');

    // Get today's date in Eastern Time
    const today = getTodayInEasternTime();

    // Delete placeholder bookings before today
    const result = await pool.query(
      `DELETE FROM bookings
       WHERE customer_email = $1
       AND customer_name = $2
       AND booking_date::date < $3::date
       RETURNING id`,
      ['booking.test@gmail.com', 'Available Slot', today]
    );

    console.log(`[Cleanup] Deleted ${result.rowCount} old placeholder bookings before ${today}`);

    res.json({
      success: true,
      message: `Cleaned up ${result.rowCount} old placeholder bookings`,
      deletedCount: result.rowCount,
      beforeDate: today
    });
  } catch (error) {
    console.error('[Cleanup] Error:', error.message);
    res.status(500).json({ error: 'Failed to cleanup placeholders' });
  }
});

// Complete schedule reset - delete ALL bookings and regenerate (admin only)
router.post('/reset-complete-schedule', verifyToken, async (req, res) => {
  try {
    console.log('[Complete Reset] Starting complete schedule reset...');

    // First, delete ALL bookings from the database
    const deleteResult = await pool.query('DELETE FROM bookings RETURNING id');
    console.log(`[Complete Reset] Deleted ${deleteResult.rowCount} bookings from database`);

    // Now regenerate fresh availability slots
    const { getUpcomingAvailability, createPlaceholderBooking } = require('../utils/availability');

    console.log('[Complete Reset] Generating fresh availability slots...');
    const slots = getUpcomingAvailability(60);
    console.log(`[Complete Reset] Generated ${slots.length} available slots`);

    // Insert fresh placeholder bookings
    let insertedCount = 0;
    for (const slot of slots) {
      try {
        const placeholder = createPlaceholderBooking(slot.date, slot.time);

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
        if (error.code === '23505') {
          // Unique constraint error - slot already exists, skip
          continue;
        }
        throw error;
      }
    }

    console.log(`[Complete Reset] ✓ Inserted ${insertedCount} fresh placeholder slots`);

    // Verify the reset
    const verifyResult = await pool.query(
      `SELECT MIN(booking_date::date) as earliest, MAX(booking_date::date) as latest, COUNT(*) as total
       FROM bookings`
    );

    const earliest = verifyResult.rows[0].earliest;
    const latest = verifyResult.rows[0].latest;
    const total = verifyResult.rows[0].total;

    console.log(`[Complete Reset] Verification: earliest=${earliest}, latest=${latest}, total=${total}`);

    res.json({
      success: true,
      message: 'Complete schedule reset successful',
      deleted: deleteResult.rowCount,
      regenerated: insertedCount,
      verification: {
        earliestDate: earliest,
        latestDate: latest,
        totalSlots: total
      }
    });
  } catch (error) {
    console.error('[Complete Reset] Error:', error.message);
    res.status(500).json({ error: 'Failed to reset schedule: ' + error.message });
  }
});

module.exports = router;
