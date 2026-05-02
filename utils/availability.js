const { v4: uuidv4 } = require('uuid');

/**
 * Business Hours Configuration
 * Defines availability for each day of the week
 */
const BUSINESS_HOURS = {
  0: null, // Sunday - Location only 6 AM - 11 AM
  1: null, // Monday - Closed
  2: null, // Tuesday - Closed
  3: null, // Wednesday - Closed
  4: { type: 'mobile', startHour: 12, endHour: 18 }, // Thursday - Mobile 12 PM - 6 PM
  5: { type: 'mobile', startHour: 12, endHour: 18 }, // Friday - Mobile 12 PM - 6 PM
  6: null, // Saturday - Location only 6 AM - 11 AM
};

/**
 * Location-only days (6 AM - 11 AM)
 */
const LOCATION_ONLY_DAYS = [0, 6]; // Sunday, Saturday

/**
 * Get business hours for a specific date
 */
function getBusinessHoursForDate(date) {
  const dayOfWeek = date.getDay();

  if (LOCATION_ONLY_DAYS.includes(dayOfWeek)) {
    return { type: 'location', startHour: 6, endHour: 11 };
  }

  return BUSINESS_HOURS[dayOfWeek];
}

/**
 * Check if date is a holiday (closed)
 * Can be extended with a holidays table in the database
 */
function isHoliday(date) {
  // TODO: Check against holidays table in database
  return false;
}

/**
 * Get available time slots for a date
 */
function getTimeSlotsForDate(date) {
  const hours = getBusinessHoursForDate(date);

  if (!hours || isHoliday(date)) {
    return [];
  }

  const slots = [];
  for (let hour = hours.startHour; hour < hours.endHour; hour++) {
    slots.push({
      time: `${hour > 12 ? hour - 12 : hour}:00 ${hour >= 12 ? 'PM' : 'AM'}`,
      hour
    });
  }

  return slots;
}

/**
 * Get available dates and times for the next N days
 */
function getUpcomingAvailability(daysAhead = 60) {
  const availability = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Start from tomorrow
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  for (let i = 0; i < daysAhead; i++) {
    const date = new Date(tomorrow);
    date.setDate(date.getDate() + i);

    const slots = getTimeSlotsForDate(date);

    slots.forEach(slot => {
      availability.push({
        date: date.toISOString().split('T')[0],
        time: slot.time,
        dateObj: new Date(date)
      });
    });
  }

  return availability;
}

/**
 * Create placeholder booking for an available slot
 */
function createPlaceholderBooking(date, time) {
  return {
    id: uuidv4(),
    customer_name: 'Available Slot',
    customer_email: 'booking.test@gmail.com',
    customer_phone: '401-123-4567',
    service_address: '123 Main St, Mapleville RI',
    service_type: 'Basic',
    booking_date: date,
    booking_time: time,
    vehicle_type: null,
    notes: null,
    vehicle_photo: null,
    status: 'pending',
    payment_status: 'unpaid',
    stripe_session_id: null,
    stripe_payment_intent_id: null,
    deposit_amount: 2500,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    is_placeholder: true
  };
}

module.exports = {
  BUSINESS_HOURS,
  LOCATION_ONLY_DAYS,
  getBusinessHoursForDate,
  isHoliday,
  getTimeSlotsForDate,
  getUpcomingAvailability,
  createPlaceholderBooking
};
