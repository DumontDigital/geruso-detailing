const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// Get available dates for a month (public)
router.get('/', async (req, res) => {
  try {
    const { year, month } = req.query;

    if (!year || !month) {
      return res.status(400).json({ error: 'Year and month required' });
    }

    const firstDay = new Date(parseInt(year), parseInt(month) - 1, 1).toISOString().split('T')[0];
    const lastDay = new Date(parseInt(year), parseInt(month), 0).toISOString().split('T')[0];

    const result = await pool.query(
      `SELECT DISTINCT date, day_of_week, is_available FROM availability
       WHERE date BETWEEN $1 AND $2
       ORDER BY date`,
      [firstDay, lastDay]
    );

    res.json({ availability: result.rows });
  } catch (error) {
    console.error('Fetch availability error:', error);
    res.status(500).json({ error: 'Failed to fetch availability' });
  }
});

// Get time slots for a specific date (public)
router.get('/:date', async (req, res) => {
  try {
    const { date } = req.params;

    const result = await pool.query(
      `SELECT * FROM availability WHERE date = $1`,
      [date]
    );

    if (result.rows.length === 0) {
      return res.json({ slots: [], message: 'No availability for this date' });
    }

    res.json({ slots: result.rows });
  } catch (error) {
    console.error('Fetch time slots error:', error);
    res.status(500).json({ error: 'Failed to fetch time slots' });
  }
});

// Add availability (admin only)
router.post('/', verifyToken, async (req, res) => {
  try {
    const { date, dayOfWeek, isAvailable, startTime, endTime, serviceType } = req.body;

    if (!date || !dayOfWeek) {
      return res.status(400).json({ error: 'Date and day of week required' });
    }

    const result = await pool.query(
      `INSERT INTO availability (id, date, day_of_week, is_available, start_time, end_time, service_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (date, service_type) DO UPDATE SET is_available = $4, start_time = $5, end_time = $6
       RETURNING *`,
      [uuidv4(), date, dayOfWeek, isAvailable, startTime, endTime, serviceType || 'both']
    );

    res.json({ success: true, availability: result.rows[0] });
  } catch (error) {
    console.error('Add availability error:', error);
    res.status(500).json({ error: 'Failed to add availability' });
  }
});

// Delete availability (admin only)
router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM availability WHERE id = $1 RETURNING id',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Availability not found' });
    }

    res.json({ success: true, message: 'Availability deleted' });
  } catch (error) {
    console.error('Delete availability error:', error);
    res.status(500).json({ error: 'Failed to delete availability' });
  }
});

module.exports = router;
