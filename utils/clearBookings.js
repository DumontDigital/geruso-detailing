const pool = require('../db');

/**
 * Clear all existing bookings from the database
 * This resets the system to start fresh with availability slots
 */
async function clearAllBookings() {
  try {
    console.log('[ClearBookings] Deleting all existing bookings...');

    const result = await pool.query('DELETE FROM bookings');

    console.log(`[ClearBookings] ✓ Deleted ${result.rowCount} bookings`);
    console.log('[ClearBookings] All time slots are now open');

    return {
      success: true,
      deletedCount: result.rowCount,
      message: `Cleared ${result.rowCount} bookings. All slots are now available.`
    };
  } catch (error) {
    console.error('[ClearBookings] Error:', error.message);
    throw error;
  }
}

/**
 * Generate availability slots for the upcoming period
 * Creates placeholder bookings for all available time slots
 */
async function generateAvailabilitySlots() {
  try {
    const { getUpcomingAvailability, createPlaceholderBooking } = require('./availability');

    console.log('[GenerateAvailability] Generating availability slots...');

    const slots = getUpcomingAvailability(60); // 60 days ahead
    console.log(`[GenerateAvailability] Generated ${slots.length} available slots`);

    // Insert placeholder bookings
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

    console.log(`[GenerateAvailability] ✓ Generated ${insertedCount} placeholder slots`);

    return {
      success: true,
      generatedCount: insertedCount,
      message: `Generated ${insertedCount} availability slots`
    };
  } catch (error) {
    console.error('[GenerateAvailability] Error:', error.message);
    throw error;
  }
}

/**
 * Reset system: Clear all bookings and generate fresh availability slots
 */
async function resetToAvailability() {
  try {
    console.log('[ResetSystem] Starting system reset...');

    // Clear existing bookings
    await clearAllBookings();

    // Generate fresh availability slots
    await generateAvailabilitySlots();

    console.log('[ResetSystem] ✓ System reset complete - all slots are available');

    return {
      success: true,
      message: 'System reset complete - fresh availability generated'
    };
  } catch (error) {
    console.error('[ResetSystem] Error:', error.message);
    throw error;
  }
}

module.exports = {
  clearAllBookings,
  generateAvailabilitySlots,
  resetToAvailability
};
