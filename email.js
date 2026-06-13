const { Resend } = require('resend');
require('dotenv').config();

console.log('[Email Config] Resend API Key:', process.env.RESEND_API_KEY ? 'SET' : 'NOT SET');
console.log('[Email Config] OWNER_EMAIL:', process.env.OWNER_EMAIL);
console.log('[Email Config] FROM_EMAIL:', process.env.FROM_EMAIL);

const resend = new Resend(process.env.RESEND_API_KEY);

// Price mapping for services - handles both flat prices and "starting from" prices
const servicePrice = {
  'Full Motorcycle Service': { price: 70, startingFrom: false },
  'Interior Detailing': { price: 100, startingFrom: true },
  'Car Wash': { price: 95, suvPrice: 110, truckPrice: 110, startingFrom: true },
  'Premium Wash': { price: 130, suvPrice: 155, truckPrice: 180, startingFrom: true },
  'Ceramic Coating': { price: 600, suvPrice: 625, truckPrice: 650, startingFrom: true },
  'Premium Package': { price: 175, suvPrice: 200, truckPrice: 225, startingFrom: true },
  'Premium Plus': { price: 245, suvPrice: 270, truckPrice: 295, startingFrom: true },
  'Ultra Premium': { price: 335, suvPrice: 360, truckPrice: 385, startingFrom: true },
  'Pet Hair / Odor Elimination': { price: 50, startingFrom: false, label: '$50 Extra Fee' },
  'Headlight Restoration': { price: 50, startingFrom: false, label: '$50 per Headlight' },
  'Engine Bay Cleaning': { price: 75, startingFrom: false },
  'Full Vehicle Polish': { price: 350, suvPrice: 375, truckPrice: 400, startingFrom: true }
};

function getVehiclePrice(priceData, vehicleType) {
  const normalizedVehicle = String(vehicleType || '').trim().toLowerCase();
  if (normalizedVehicle === 'truck' && priceData.truckPrice) return priceData.truckPrice;
  if (normalizedVehicle === 'suv' && priceData.suvPrice) return priceData.suvPrice;
  return priceData.price;
}

function toPlainDateString(dateValue) {
  if (!dateValue) return '';
  if (dateValue instanceof Date) return dateValue.toISOString().split('T')[0];
  return String(dateValue).split('T')[0];
}

function parseBookingTime(timeValue) {
  const match = String(timeValue || '').trim().match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)$/i);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2] || '0', 10);
  const meridiem = match[3].toUpperCase();

  if (meridiem === 'PM' && hour !== 12) hour += 12;
  if (meridiem === 'AM' && hour === 12) hour = 0;

  return { hour, minute };
}

function toGoogleCalendarDateTime(dateValue, timeValue, addMinutes = 0) {
  const date = toPlainDateString(dateValue);
  const time = parseBookingTime(timeValue);
  if (!date || !time) return null;

  const [year, month, day] = date.split('-').map(Number);
  const localDate = new Date(year, month - 1, day, time.hour, time.minute + addMinutes, 0);
  const pad = value => String(value).padStart(2, '0');

  return `${localDate.getFullYear()}${pad(localDate.getMonth() + 1)}${pad(localDate.getDate())}T${pad(localDate.getHours())}${pad(localDate.getMinutes())}00`;
}

function buildCalendarLink(bookingData) {
  const start = toGoogleCalendarDateTime(bookingData.bookingDate, bookingData.bookingTime);
  const end = toGoogleCalendarDateTime(bookingData.bookingDate, bookingData.bookingTime, 120);
  if (!start || !end) return '';

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Geruso Detailing - ${bookingData.serviceType || 'Detailing Appointment'}`,
    dates: `${start}/${end}`,
    ctz: 'America/New_York',
    details: [
      `Customer: ${bookingData.customerName || ''}`,
      `Phone: ${bookingData.customerPhone || ''}`,
      `Email: ${bookingData.customerEmail || ''}`,
      `Service: ${bookingData.serviceType || ''}`,
      `Vehicle: ${bookingData.vehicleType || 'Not specified'}`,
      bookingData.notes ? `Notes: ${bookingData.notes}` : ''
    ].filter(Boolean).join('\n'),
    location: bookingData.serviceAddress || ''
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Extract price from service type string and return formatted price display
function extractPrice(serviceType, vehicleType) {
  console.log('[Price Extraction] Extracting price from:', serviceType);

  // Try exact match first
  for (const [serviceName, priceData] of Object.entries(servicePrice)) {
    if (serviceType.includes(serviceName)) {
      const price = getVehiclePrice(priceData, vehicleType);
      const { startingFrom, label } = priceData;

      if (label) {
        console.log('[Price Extraction] Found label:', label);
        return label;
      }

      if (startingFrom) {
        console.log('[Price Extraction] Price: Starting from $' + price);
        return `Starting from $${price}`;
      }

      console.log('[Price Extraction] Price: $' + price);
      return `$${price}`;
    }
  }

  // Fallback: extract first dollar amount if exists
  const match = serviceType.match(/\$(\d+)/);
  const price = match ? match[1] : '0';
  console.log('[Price Extraction] Fallback extraction: $' + price);
  return `$${price}`;
}

// Extract just the numeric price for database storage
function extractNumericPrice(serviceType, vehicleType) {
  for (const [serviceName, priceData] of Object.entries(servicePrice)) {
    if (serviceType.includes(serviceName)) {
      return getVehiclePrice(priceData, vehicleType);
    }
  }

  const match = serviceType.match(/\$(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

// Format date string (YYYY-MM-DD) to readable format WITHOUT UTC conversion
function formatBookingDateForEmail(dateStr) {
  try {
    const plainDate = toPlainDateString(dateStr);
    // Parse YYYY-MM-DD string directly (no UTC conversion)
    const [year, month, day] = plainDate.split('-');

    // Create date object using local timezone components ONLY
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));

    // Format using Intl API with Eastern Time
    const formatter = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/New_York'
    });

    return formatter.format(date);
  } catch (error) {
    console.error('[Date Formatting] Error formatting date:', error);
    return dateStr; // Fallback to raw string
  }
}

const sendQuoteEmail = async (quoteData) => {
  const { firstName, lastName, email, phone, service, message } = quoteData;

  console.log('[Quote Email] Sending quote email:', { firstName, lastName, email, phone, service });
  console.log('[Quote Email] Recipient (OWNER_EMAIL):', process.env.OWNER_EMAIL);
  console.log('[Quote Email] From (FROM_EMAIL):', process.env.FROM_EMAIL);

  // Check if environment variables are set
  if (!process.env.RESEND_API_KEY) {
    console.error('[Quote Email] FAILED - Missing RESEND_API_KEY');
    return { success: false, error: 'Email service not configured. Please contact support.' };
  }

  if (!process.env.OWNER_EMAIL) {
    console.error('[Quote Email] FAILED - OWNER_EMAIL not configured');
    return { success: false, error: 'Email configuration missing. Please contact support.' };
  }

  // Extract price from service type for context
  const priceDisplay = extractPrice(service);

  const htmlContent = `
    <h2>New Quote Request from Geruso Detailing Website</h2>
    <p><strong>Customer Name:</strong> ${firstName} ${lastName}</p>
    <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
    <p><strong>Phone:</strong> <a href="tel:${phone}">${phone}</a></p>
    <p><strong>Service Requested:</strong> ${service}</p>
    <p><strong>Estimated Price:</strong> ${priceDisplay}</p>
    <p><strong>Message / Notes:</strong></p>
    <p>${message || 'No additional message provided'}</p>
    <hr>
    <p><small>This quote request was submitted via your website. Reply directly to the customer's email or call them.</small></p>
  `;

  try {
    console.log('[Quote Email] Calling Resend API...');
    const result = await resend.emails.send({
      from: process.env.FROM_EMAIL || 'onboarding@resend.dev',
      to: process.env.OWNER_EMAIL,
      subject: `New Quote Request - ${firstName} ${lastName}`,
      html: htmlContent,
    });

    if (result.error) {
      console.error('[Quote Email] FAILED - Resend error:', result.error);
      return { success: false, error: result.error.message || 'Failed to send email. Please try again.' };
    }

    console.log('[Quote Email] SUCCESS - Email ID:', result.data.id);
    return { success: true };
  } catch (error) {
    console.error('[Quote Email] FAILED - Error:', error.message);
    return { success: false, error: error.message };
  }
};

const sendBookingConfirmation = async (bookingData) => {
  const { customerName, customerEmail, bookingDate, bookingTime, serviceType, serviceAddress, vehicleType, hasPhoto } = bookingData;

  // Extract price from service type
  const priceDisplay = extractPrice(serviceType, vehicleType);

  const htmlContent = `
    <h2>Booking Confirmation - Geruso Detailing</h2>
    <p>Hello ${customerName},</p>
    <p>Thank you for booking with Geruso Detailing! Here are your booking details:</p>
    <hr>
    <p><strong>Service:</strong> ${serviceType}</p>
    <p><strong>Date:</strong> ${formatBookingDateForEmail(bookingDate)}</p>
    <p><strong>Time:</strong> ${bookingTime}</p>
    <p><strong>Service Address:</strong> ${serviceAddress}</p>
    <p><strong>Price:</strong> ${priceDisplay}</p>
    ${hasPhoto ? '<p><strong>Vehicle Photo:</strong> ✓ Uploaded</p>' : ''}
    <hr>
    <p>If you need to reschedule or cancel, please contact us at 401-490-1236.</p>
    <p>We look forward to detailing your vehicle!</p>
    <p><strong>Geruso Detailing</strong><br>
    313 Lynne Lane, Mapleville<br>
    By appointment only. No walk-ins.<br>
    401-490-1236</p>
  `;

  try {
    const result = await resend.emails.send({
      from: process.env.FROM_EMAIL || 'onboarding@resend.dev',
      to: customerEmail,
      subject: `Booking Confirmation - ${serviceType}`,
      html: htmlContent,
    });

    if (result.error) {
      console.error('Booking confirmation email error:', result.error);
      return { success: false, error: result.error.message };
    }

    return { success: true };
  } catch (error) {
    console.error('Booking confirmation email error:', error);
    return { success: false, error: error.message };
  }
};

const sendOwnerNotification = async (bookingData) => {
  const { customerName, customerEmail, customerPhone, bookingDate, bookingTime, serviceType, serviceAddress, vehicleType, notes, hasPhoto, paymentConfirmed } = bookingData;

  // Extract price from service type
  const priceDisplay = extractPrice(serviceType, vehicleType);
  const calendarLink = buildCalendarLink(bookingData);

  console.log('[Owner Notification] Sending owner notification for booking:', { customerName, bookingDate, bookingTime });

  // Check if environment variables are set
  if (!process.env.RESEND_API_KEY) {
    console.error('[Owner Notification] FAILED - Missing RESEND_API_KEY');
    return { success: false, error: 'Email service not configured. Please contact support.' };
  }

  if (!process.env.OWNER_EMAIL) {
    console.error('[Owner Notification] FAILED - OWNER_EMAIL not configured');
    return { success: false, error: 'Owner email not configured. Please contact support.' };
  }

  const htmlContent = `
    <h2>${paymentConfirmed ? 'Paid Booking Confirmed' : 'New Booking Received'} - Geruso Detailing</h2>
    <p>${paymentConfirmed ? 'A customer completed payment through Stripe. Here are the complete appointment details:' : 'A new booking has been submitted. Here are the complete details:'}</p>
    ${calendarLink ? `<p><a href="${calendarLink}" style="display:inline-block;padding:12px 18px;background:#00ff41;color:#000;font-weight:700;text-decoration:none;border-radius:8px;">Add to Google Calendar</a></p>` : ''}
    <hr>
    <p><strong>Customer Name:</strong> ${customerName}</p>
    <p><strong>Email:</strong> <a href="mailto:${customerEmail}">${customerEmail}</a></p>
    <p><strong>Phone:</strong> <a href="tel:${customerPhone}">${customerPhone}</a></p>
    <p><strong>Service Type:</strong> ${serviceType}</p>
    <p><strong>Date:</strong> ${formatBookingDateForEmail(bookingDate)}</p>
    <p><strong>Time:</strong> ${bookingTime}</p>
    <p><strong>Service Address:</strong> ${serviceAddress}</p>
    <p><strong>Vehicle Type:</strong> ${vehicleType || 'Not specified'}</p>
    <p><strong>Price:</strong> ${priceDisplay}</p>
    ${notes ? `<p><strong>Special Requests:</strong> ${notes}</p>` : ''}
    ${hasPhoto ? '<p><strong>Vehicle Photo:</strong> ✓ Uploaded</p>' : '<p><strong>Vehicle Photo:</strong> Not included</p>'}
    <hr>
    <p>Log in to the admin dashboard to view full booking details and manage this appointment.</p>
  `;

  try {
    console.log('[Owner Notification] Calling Resend API...');
    const result = await resend.emails.send({
      from: process.env.FROM_EMAIL || 'onboarding@resend.dev',
      to: process.env.OWNER_EMAIL,
      subject: `${paymentConfirmed ? 'Paid Booking Confirmed' : 'New Booking Received'} - ${customerName} - ${formatBookingDateForEmail(bookingDate)}`,
      html: htmlContent,
    });

    if (result.error) {
      console.error('[Owner Notification] FAILED - Resend error:', result.error);
      return { success: false, error: result.error.message };
    }

    console.log('[Owner Notification] SUCCESS - Email ID:', result.data.id);
    return { success: true };
  } catch (error) {
    console.error('[Owner Notification] FAILED - Error:', error.message);
    return { success: false, error: error.message };
  }
};

const sendMaintenanceSubscriptionNotification = async (subscriptionData) => {
  const {
    customer_name,
    customer_email,
    customer_phone,
    plan_name,
    plan_interval,
    price_cents,
    status
  } = subscriptionData;

  if (!process.env.RESEND_API_KEY) {
    console.error('[Maintenance Email] FAILED - Missing RESEND_API_KEY');
    return { success: false, error: 'Email service not configured' };
  }

  if (!process.env.OWNER_EMAIL) {
    console.error('[Maintenance Email] FAILED - OWNER_EMAIL not configured');
    return { success: false, error: 'Owner email not configured' };
  }

  const price = `$${(Number(price_cents || 0) / 100).toFixed(0)}`;
  const htmlContent = `
    <h2>New Maintenance Subscription - Geruso Detailing</h2>
    <p>A customer started a recurring maintenance plan through Stripe.</p>
    <hr>
    <p><strong>Customer Name:</strong> ${customer_name}</p>
    <p><strong>Email:</strong> <a href="mailto:${customer_email}">${customer_email}</a></p>
    <p><strong>Phone:</strong> <a href="tel:${customer_phone}">${customer_phone}</a></p>
    <p><strong>Plan:</strong> ${plan_name}</p>
    <p><strong>Frequency:</strong> ${plan_interval}</p>
    <p><strong>Price:</strong> ${price}</p>
    <p><strong>Status:</strong> ${status || 'active'}</p>
    <hr>
    <p>Log in to the owner/dev dashboard to manage this subscription.</p>
  `;

  try {
    const result = await resend.emails.send({
      from: process.env.FROM_EMAIL || 'onboarding@resend.dev',
      to: process.env.OWNER_EMAIL,
      subject: `New Maintenance Subscription - ${customer_name} - ${plan_name}`,
      html: htmlContent,
    });

    if (result.error) {
      console.error('[Maintenance Email] FAILED - Resend error:', result.error);
      return { success: false, error: result.error.message };
    }

    console.log('[Maintenance Email] SUCCESS - Email ID:', result.data.id);
    return { success: true };
  } catch (error) {
    console.error('[Maintenance Email] FAILED - Error:', error.message);
    return { success: false, error: error.message };
  }
};

const sendOwnerEmail = async (requestData) => {
  const { requestType, requestDetails, submittedAt } = requestData;

  console.log('[Owner Email] Sending owner update request');

  if (!process.env.RESEND_API_KEY) {
    console.error('[Owner Email] FAILED - Missing RESEND_API_KEY');
    return { success: false, error: 'Email service not configured' };
  }

  if (!process.env.OWNER_EMAIL) {
    console.error('[Owner Email] FAILED - OWNER_EMAIL not configured');
    return { success: false, error: 'Owner email not configured' };
  }

  const requestTypeLabels = {
    price: 'Price Change Request',
    schedule: 'Schedule Change Request',
    service: 'Service Edit/New Service',
    photo: 'Gallery Photo Update',
    other: 'Other Request'
  };

  const htmlContent = `
    <h2>${requestTypeLabels[requestType] || requestType}</h2>
    <p><strong>Request Type:</strong> ${requestTypeLabels[requestType] || requestType}</p>
    <p><strong>Submitted:</strong> ${new Date(submittedAt).toLocaleString()}</p>
    <hr>
    <p><strong>Details:</strong></p>
    <p>${requestDetails.replace(/\n/g, '<br>')}</p>
    <hr>
    <p><small>This request was submitted via the Geruso Detailing website owner panel.</small></p>
  `;

  try {
    console.log('[Owner Email] Calling Resend API...');
    const result = await resend.emails.send({
      from: process.env.FROM_EMAIL || 'onboarding@resend.dev',
      to: process.env.OWNER_EMAIL,
      subject: `Owner Update Request - ${requestTypeLabels[requestType] || requestType}`,
      html: htmlContent,
    });

    if (result.error) {
      console.error('[Owner Email] FAILED - Resend error:', result.error);
      return { success: false, error: result.error.message };
    }

    console.log('[Owner Email] SUCCESS - Email ID:', result.data.id);
    return { success: true };
  } catch (error) {
    console.error('[Owner Email] FAILED - Error:', error.message);
    return { success: false, error: error.message };
  }
};

module.exports = { sendQuoteEmail, sendBookingConfirmation, sendOwnerNotification, sendOwnerEmail, sendMaintenanceSubscriptionNotification };
