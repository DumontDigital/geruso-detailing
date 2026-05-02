const { v4: uuidv4 } = require('uuid');

/**
 * Get today's date in Eastern Time (America/New_York timezone)
 * Returns date string in YYYY-MM-DD format
 */
function getTodayInEasternTime() {
  const now = new Date();
  const easternFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });

  const parts = easternFormatter.formatToParts(now);
  const year = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day = parts.find(p => p.type === 'day').value;

  return `${year}-${month}-${day}`;
}

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
    return { type: 'location', startHour: 6, endHour: 12 }; // endHour 12 means up to 11 AM inclusive (loop uses < operator)
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
 * Add N days to an Eastern Time date string (YYYY-MM-DD)
 * Works entirely with numbers, no Date objects
 */
function addDaysToEasternDate(dateStr, days) {
  const [year, month, day] = dateStr.split('-').map(Number);

  // Simple number arithmetic for date
  let newDay = day + days;
  let newMonth = month;
  let newYear = year;

  // Days per month (non-leap year for simplicity - leap years handled by overflow)
  const daysInMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  // Handle leap year for February
  if ((newYear % 4 === 0 && newYear % 100 !== 0) || (newYear % 400 === 0)) {
    daysInMonth[1] = 29;
  }

  // Normalize day/month/year
  while (newDay > daysInMonth[newMonth - 1]) {
    newDay -= daysInMonth[newMonth - 1];
    newMonth++;
    if (newMonth > 12) {
      newMonth = 1;
      newYear++;
      // Recalculate leap year for new year
      if ((newYear % 4 === 0 && newYear % 100 !== 0) || (newYear % 400 === 0)) {
        daysInMonth[1] = 29;
      } else {
        daysInMonth[1] = 28;
      }
    }
  }

  return `${newYear}-${String(newMonth).padStart(2, '0')}-${String(newDay).padStart(2, '0')}`;
}

/**
 * Get day of week for an Eastern Time date string (0=Sunday, 1=Monday, etc)
 * Uses Zeller's algorithm to avoid Date objects
 */
function getDayOfWeekForEasternDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);

  // Zeller's congruence algorithm (works for any date)
  // Adjust month and year for January/February
  let m = month;
  let y = year;
  if (m <= 2) {
    m += 12;
    y -= 1;
  }

  // Zeller's formula
  const K = y % 100; // Year of century
  const J = Math.floor(y / 100); // Zero-based century

  const h = (day + Math.floor((13 * (m + 1)) / 5) + K + Math.floor(K / 4) + Math.floor(J / 4) - 2 * J) % 7;

  // Convert to 0=Sunday, 1=Monday... (h is 0=Saturday in Zeller's)
  return (h + 6) % 7;
}

/**
 * Get available dates and times for the next N days (starting from today in Eastern Time)
 * Works entirely with Eastern Time date strings to avoid timezone conversion issues
 */
function getUpcomingAvailability(daysAhead = 60) {
  const availability = [];

  // Get today's date in Eastern Time (America/New_York)
  const todayEastern = getTodayInEasternTime();

  // Start from today in Eastern Time, not tomorrow
  for (let i = 0; i < daysAhead; i++) {
    const dateKey = addDaysToEasternDate(todayEastern, i); // YYYY-MM-DD
    const dayOfWeek = getDayOfWeekForEasternDate(dateKey);

    // Get business hours for this date
    let hours = null;
    if (LOCATION_ONLY_DAYS.includes(dayOfWeek)) {
      hours = { type: 'location', startHour: 6, endHour: 12 };
    } else {
      hours = BUSINESS_HOURS[dayOfWeek];
    }

    if (!hours) {
      // Day is closed, skip it
      continue;
    }

    // Generate time slots for this date
    for (let hour = hours.startHour; hour < hours.endHour; hour++) {
      const time = `${hour > 12 ? hour - 12 : hour}:00 ${hour >= 12 ? 'PM' : 'AM'}`;
      availability.push({
        dateKey: dateKey,           // YYYY-MM-DD for database and comparison
        time: time,                 // HH:MM AM/PM for display
        sortKey: `${dateKey} ${String(hour).padStart(2, '0')}:00` // For sorting
      });
    }
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
  createPlaceholderBooking,
  getTodayInEasternTime,
  getDayOfWeekForEasternDate,
  addDaysToEasternDate
};
