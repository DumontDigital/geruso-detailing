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

    // Don't use Date objects - construct date strings directly
    const yearNum = parseInt(year);
    const monthNum = parseInt(month);
    const firstDay = `${yearNum}-${String(monthNum).padStart(2, '0')}-01`;

    // Last day of month - handle month bounds correctly
    const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if ((yearNum % 4 === 0 && yearNum % 100 !== 0) || (yearNum % 400 === 0)) {
      daysInMonth[1] = 29; // Leap year February
    }
    const lastDay = `${yearNum}-${String(monthNum).padStart(2, '0')}-${String(daysInMonth[monthNum - 1]).padStart(2, '0')}`;

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

// Generate availability schedule based on business hours (admin only)
router.post('/generate-schedule', verifyToken, async (req, res) => {
  try {
    const { getUpcomingAvailability, BUSINESS_HOURS } = require('../utils/availability');

    // Import the day-of-week function that uses Eastern Time
    const availabilityModule = require('../utils/availability');

    console.log('[Availability] Generating availability schedule...');

    // Clear existing availability data
    await pool.query('DELETE FROM availability');

    // Get upcoming availability slots
    const slots = getUpcomingAvailability(60);

    // Group slots by date and get day info
    const dateMap = new Map();
    slots.forEach(slot => {
      if (!dateMap.has(slot.dateKey)) {
        // Use getDayOfWeekForEasternDate from the availability module
        const dayNum = availabilityModule.getDayOfWeekForEasternDate(slot.dateKey);
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        dateMap.set(slot.dateKey, {
          date: slot.dateKey,
          dayOfWeek: dayNames[dayNum],
          dayNum: dayNum
        });
      }
    });

    // Insert availability records
    let insertedCount = 0;
    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    for (const [dateStr, dayInfo] of dateMap.entries()) {
      const dayNum = dayInfo.dayNum;
      const dayName = DAYS[dayNum];

      // Determine business hours for this day
      let hours = null;
      let serviceType = 'both';
      let isAvailable = false;

      if (dayNum === 0 || dayNum === 6) { // Sunday or Saturday
        hours = { startHour: 6, endHour: 12 }; // 6 AM - 11 AM (endHour is exclusive in slot generation)
        serviceType = 'location';
        isAvailable = true;
      } else if (dayNum === 4 || dayNum === 5) { // Thursday or Friday
        hours = { startHour: 12, endHour: 18 }; // 12 PM - 5 PM (endHour is exclusive in slot generation)
        serviceType = 'mobile';
        isAvailable = true;
      } else {
        // Closed days
        isAvailable = false;
      }

      const startTime = isAvailable && hours ? `${String(hours.startHour).padStart(2, '0')}:00:00` : null;
      const endTime = isAvailable && hours ? `${String(hours.endHour).padStart(2, '0')}:00:00` : null;

      try {
        await pool.query(
          `INSERT INTO availability (date, day_of_week, is_available, service_type, start_time, end_time)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (date, service_type) DO UPDATE SET is_available = $3, start_time = $5, end_time = $6`,
          [dateStr, dayName, isAvailable, serviceType, startTime, endTime]
        );
        insertedCount++;
      } catch (e) {
        console.error(`Error inserting availability for ${dateStr}:`, e.message);
      }
    }

    console.log(`[Availability] Generated ${insertedCount} availability records`);
    res.json({
      success: true,
      message: 'Availability schedule generated',
      generatedCount: insertedCount
    });
  } catch (error) {
    console.error('[Availability] Error generating schedule:', error);
    res.status(500).json({ error: 'Failed to generate schedule' });
  }
});

module.exports = router;
