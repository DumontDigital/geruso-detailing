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

    let query = 'SELECT * FROM bookings WHERE 1=1';
    const params = [];

    if (status) {
      query += ' AND status = $1';
      params.push(status);
    }

    if (search) {
      query += ` AND (customer_name ILIKE '%' || $${params.length + 1} || '%' OR customer_email ILIKE '%' || $${params.length + 1} || '%')`;
      params.push(search);
    }

    query += ' ORDER BY booking_date ASC, booking_time ASC';

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

module.exports = router;
