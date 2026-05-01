const express = require('express');
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// Get dashboard stats (admin only)
router.get('/dashboard', verifyToken, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

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

    // Upcoming bookings next 7 days
    const upcomingResult = await pool.query(
      `SELECT * FROM bookings
       WHERE booking_date BETWEEN $1 AND $2
       ORDER BY booking_date ASC, booking_time ASC
       LIMIT 10`,
      [today, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]]
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

    query += ' ORDER BY booking_date DESC';

    const result = await pool.query(query, params);
    res.json({ bookings: result.rows });
  } catch (error) {
    console.error('Fetch admin bookings error:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

module.exports = router;
