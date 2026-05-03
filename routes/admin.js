const express = require('express');
const pool = require('../db');
const { verifyToken } = require('../middleware/auth');
const { getTodayInEasternTime } = require('../utils/availability');

const router = express.Router();

// Get dashboard stats (admin only)
router.get('/dashboard', verifyToken, async (req, res) => {
  try {
    // Use Eastern Time for dashboard stats
    const { getTodayInEasternTime, addDaysToEasternDate } = require('../utils/availability');
    const today = getTodayInEasternTime();

    // Calculate week ago in Eastern Time using string arithmetic
    const weekAgo = addDaysToEasternDate(today, -7);

    // All counts/totals exclude cancelled bookings — once a booking is
    // cancelled it should not show up in the tracker.

    // Today's bookings (active only)
    const todayResult = await pool.query(
      "SELECT COUNT(*) as count FROM bookings WHERE booking_date = $1 AND status <> 'cancelled'",
      [today]
    );

    // This week's bookings (active only)
    const weekResult = await pool.query(
      "SELECT COUNT(*) as count FROM bookings WHERE booking_date BETWEEN $1 AND $2 AND status <> 'cancelled'",
      [weekAgo, today]
    );

    // Pending confirmations (cancelled is its own status, so this naturally excludes them)
    const pendingResult = await pool.query(
      'SELECT COUNT(*) as count FROM bookings WHERE status = $1',
      ['pending']
    );

    // Revenue from confirmed bookings only (cancelled never count)
    const revenueResult = await pool.query(
      `SELECT SUM(CAST(SUBSTRING(service_type FROM '\\$(\\d+)') AS INTEGER)) as total
       FROM bookings
       WHERE status = $1 AND booking_date >= $2`,
      ['confirmed', weekAgo]
    );

    // Upcoming bookings next 7 days, excluding cancelled
    const sevenDaysLaterStr = addDaysToEasternDate(today, 7);

    const upcomingResult = await pool.query(
      `SELECT * FROM bookings
       WHERE booking_date BETWEEN $1 AND $2 AND status <> 'cancelled'
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

// ===== BOOKING MANAGEMENT ENDPOINTS =====

// Get a single booking (admin only)
router.get('/booking/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'SELECT * FROM bookings WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching booking:', error);
    res.status(500).json({ error: 'Failed to fetch booking' });
  }
});

// Update a booking (admin only)
router.put('/booking/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { customer_name, customer_email, customer_phone, service_address, service_type, booking_date, booking_time, vehicle_type, notes, status } = req.body;

    const result = await pool.query(
      `UPDATE bookings SET customer_name = $1, customer_email = $2, customer_phone = $3, service_address = $4, service_type = $5, booking_date = $6, booking_time = $7, vehicle_type = $8, notes = $9, status = $10, updated_at = CURRENT_TIMESTAMP WHERE id = $11 RETURNING *`,
      [customer_name, customer_email, customer_phone, service_address, service_type, booking_date, booking_time, vehicle_type, notes, status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json({
      success: true,
      booking: result.rows[0],
      message: 'Booking updated successfully'
    });
  } catch (error) {
    console.error('Error updating booking:', error);
    if (error.code === '23505') {
      return res.status(409).json({ error: 'Time slot already booked' });
    }
    res.status(500).json({ error: 'Failed to update booking' });
  }
});

// Delete a booking (admin only)
router.delete('/booking/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM bookings WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json({
      success: true,
      message: 'Booking deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting booking:', error);
    res.status(500).json({ error: 'Failed to delete booking' });
  }
});

// Mark booking as confirmed (admin only)
router.post('/booking/:id/mark-confirmed', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'UPDATE bookings SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      ['confirmed', id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json({
      success: true,
      booking: result.rows[0],
      message: 'Booking marked as confirmed'
    });
  } catch (error) {
    console.error('Error marking booking as confirmed:', error);
    res.status(500).json({ error: 'Failed to mark booking as confirmed' });
  }
});

// Cancel a booking (admin only)
router.post('/booking/:id/cancel', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'UPDATE bookings SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      ['cancelled', id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }

    res.json({
      success: true,
      booking: result.rows[0],
      message: 'Booking cancelled successfully'
    });
  } catch (error) {
    console.error('Error cancelling booking:', error);
    res.status(500).json({ error: 'Failed to cancel booking' });
  }
});

// ===== SERVICES ENDPOINTS =====

// Get all services (admin only)
router.get('/services', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, description, price, category, is_active, display_order FROM services ORDER BY display_order ASC, name ASC'
    );
    res.json({ services: result.rows });
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

// Create new service (admin only)
router.post('/services', verifyToken, async (req, res) => {
  try {
    const { name, description, price, category, is_active, display_order } = req.body;

    if (!name || !price) {
      return res.status(400).json({ error: 'Name and price are required' });
    }

    const result = await pool.query(
      `INSERT INTO services (name, description, price, category, is_active, display_order)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, description || '', price, category || '', is_active !== false, display_order || 999]
    );

    res.json({ success: true, service: result.rows[0] });
  } catch (error) {
    console.error('Error creating service:', error);
    res.status(500).json({ error: 'Failed to create service' });
  }
});

// Update service (admin only)
router.put('/services/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, category, is_active, display_order } = req.body;

    const result = await pool.query(
      `UPDATE services SET name = $1, description = $2, price = $3, category = $4, is_active = $5, display_order = $6, updated_at = CURRENT_TIMESTAMP WHERE id = $7 RETURNING *`,
      [name, description, price, category, is_active, display_order, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }

    res.json({ success: true, service: result.rows[0] });
  } catch (error) {
    console.error('Error updating service:', error);
    res.status(500).json({ error: 'Failed to update service' });
  }
});

// Delete service (admin only)
router.delete('/services/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM services WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Service not found' });
    }

    res.json({ success: true, message: 'Service deleted successfully' });
  } catch (error) {
    console.error('Error deleting service:', error);
    res.status(500).json({ error: 'Failed to delete service' });
  }
});

// ===== ADD-ONS ENDPOINTS =====

// Get all add-ons (admin only)
router.get('/addons', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, description, price, is_active, display_order FROM addons ORDER BY display_order ASC, name ASC'
    );
    res.json({ addons: result.rows });
  } catch (error) {
    console.error('Error fetching add-ons:', error);
    res.status(500).json({ error: 'Failed to fetch add-ons' });
  }
});

// Create new add-on (admin only)
router.post('/addons', verifyToken, async (req, res) => {
  try {
    const { name, description, price, is_active, display_order } = req.body;

    if (!name || !price) {
      return res.status(400).json({ error: 'Name and price are required' });
    }

    const result = await pool.query(
      `INSERT INTO addons (name, description, price, is_active, display_order)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [name, description || '', price, is_active !== false, display_order || 999]
    );

    res.json({ success: true, addon: result.rows[0] });
  } catch (error) {
    console.error('Error creating add-on:', error);
    res.status(500).json({ error: 'Failed to create add-on' });
  }
});

// Update add-on (admin only)
router.put('/addons/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, is_active, display_order } = req.body;

    const result = await pool.query(
      `UPDATE addons SET name = $1, description = $2, price = $3, is_active = $4, display_order = $5, updated_at = CURRENT_TIMESTAMP WHERE id = $6 RETURNING *`,
      [name, description, price, is_active, display_order, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Add-on not found' });
    }

    res.json({ success: true, addon: result.rows[0] });
  } catch (error) {
    console.error('Error updating add-on:', error);
    res.status(500).json({ error: 'Failed to update add-on' });
  }
});

// Delete add-on (admin only)
router.delete('/addons/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM addons WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Add-on not found' });
    }

    res.json({ success: true, message: 'Add-on deleted successfully' });
  } catch (error) {
    console.error('Error deleting add-on:', error);
    res.status(500).json({ error: 'Failed to delete add-on' });
  }
});

// ===== SETTINGS/CONTENT ENDPOINTS =====

// Get all settings (admin only)
router.get('/settings', verifyToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM settings LIMIT 1');

    if (result.rows.length === 0) {
      // Return empty settings object if no data exists
      return res.json({
        owner_email: '',
        notification_email: '',
        business_phone: '',
        business_email: '',
        business_address: '',
        service_area: '',
        location_description: '',
        faq_text: '',
        homepage_headline: '',
        homepage_subheadline: ''
      });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

// Update settings (admin only)
router.post('/settings', verifyToken, async (req, res) => {
  try {
    const {
      owner_email,
      notification_email,
      business_phone,
      business_email,
      business_address,
      service_area,
      location_description,
      faq_text,
      homepage_headline,
      homepage_subheadline
    } = req.body;

    // Check if settings exist
    const existing = await pool.query('SELECT id FROM settings LIMIT 1');

    if (existing.rows.length === 0) {
      // Create new settings record
      const result = await pool.query(
        `INSERT INTO settings (owner_email, notification_email, business_phone, business_email, business_address, service_area, location_description, faq_text, homepage_headline, homepage_subheadline)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [owner_email, notification_email, business_phone, business_email, business_address, service_area, location_description, faq_text, homepage_headline, homepage_subheadline]
      );
      return res.json({ success: true, settings: result.rows[0] });
    }

    // Update existing settings
    const result = await pool.query(
      `UPDATE settings SET
        owner_email = $1,
        notification_email = $2,
        business_phone = $3,
        business_email = $4,
        business_address = $5,
        service_area = $6,
        location_description = $7,
        faq_text = $8,
        homepage_headline = $9,
        homepage_subheadline = $10,
        updated_at = CURRENT_TIMESTAMP
       WHERE id = $11 RETURNING *`,
      [owner_email, notification_email, business_phone, business_email, business_address, service_area, location_description, faq_text, homepage_headline, homepage_subheadline, existing.rows[0].id]
    );

    res.json({ success: true, settings: result.rows[0] });
  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

// ===== SCHEDULE ENDPOINTS =====

// Get business hours schedule (admin only)
router.get('/schedule', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, day_of_week, is_open, start_time, end_time, is_mobile_day, is_shop_day FROM schedule ORDER BY ARRAY_POSITION(ARRAY[\'Monday\', \'Tuesday\', \'Wednesday\', \'Thursday\', \'Friday\', \'Saturday\', \'Sunday\'], day_of_week)'
    );
    res.json({ schedule: result.rows });
  } catch (error) {
    console.error('Error fetching schedule:', error);
    res.status(500).json({ error: 'Failed to fetch schedule' });
  }
});

// Update business hours for a day (admin only)
router.put('/schedule/:day', verifyToken, async (req, res) => {
  try {
    const { day } = req.params;
    const { is_open, start_time, end_time, is_mobile_day, is_shop_day } = req.body;

    const result = await pool.query(
      `UPDATE schedule SET is_open = $1, start_time = $2, end_time = $3, is_mobile_day = $4, is_shop_day = $5, updated_at = CURRENT_TIMESTAMP WHERE day_of_week = $6 RETURNING *`,
      [is_open, start_time, end_time, is_mobile_day, is_shop_day, day]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Schedule day not found' });
    }

    res.json({ success: true, schedule: result.rows[0] });
  } catch (error) {
    console.error('Error updating schedule:', error);
    res.status(500).json({ error: 'Failed to update schedule' });
  }
});

// ===== GALLERY ENDPOINTS =====

// Get gallery photos (admin only)
router.get('/gallery', verifyToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, filename, label, description, display_order, is_active FROM gallery_photos ORDER BY display_order ASC'
    );
    res.json({ photos: result.rows });
  } catch (error) {
    console.error('Error fetching gallery:', error);
    res.status(500).json({ error: 'Failed to fetch gallery' });
  }
});

// Add photo to gallery (admin only)
router.post('/gallery', verifyToken, async (req, res) => {
  try {
    const { filename, label, description, display_order } = req.body;

    if (!filename) {
      return res.status(400).json({ error: 'Filename is required' });
    }

    const result = await pool.query(
      `INSERT INTO gallery_photos (filename, label, description, display_order, is_active)
       VALUES ($1, $2, $3, $4, true) RETURNING *`,
      [filename, label || '', description || '', display_order || 999]
    );

    res.json({ success: true, photo: result.rows[0] });
  } catch (error) {
    console.error('Error adding photo:', error);
    res.status(500).json({ error: 'Failed to add photo' });
  }
});

// Update gallery photo (admin only)
router.put('/gallery/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { label, description, display_order, is_active } = req.body;

    const result = await pool.query(
      `UPDATE gallery_photos SET label = $1, description = $2, display_order = $3, is_active = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5 RETURNING *`,
      [label, description, display_order, is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    res.json({ success: true, photo: result.rows[0] });
  } catch (error) {
    console.error('Error updating photo:', error);
    res.status(500).json({ error: 'Failed to update photo' });
  }
});

// Delete gallery photo (admin only)
router.delete('/gallery/:id', verifyToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM gallery_photos WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    res.json({ success: true, message: 'Photo deleted successfully' });
  } catch (error) {
    console.error('Error deleting photo:', error);
    res.status(500).json({ error: 'Failed to delete photo' });
  }
});

module.exports = router;
