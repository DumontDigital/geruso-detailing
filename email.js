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
  'Car Wash': { price: 85, startingFrom: true },
  'Ceramic Coating': { price: 400, startingFrom: false },
  'Premium Package': { price: 170, startingFrom: true },
  'Ultra Premium': { price: 335, startingFrom: false },
  'Pet Hair / Odor Elimination': { price: 50, startingFrom: false, label: '$50 Extra Fee' },
  'Headlight Restoration': { price: 50, startingFrom: false, label: '$50 per Headlight' },
  'Engine Bay Cleaning': { price: 75, startingFrom: false },
  'Full Vehicle Polish': { price: 250, startingFrom: true }
};

// Extract price from service type string and return formatted price display
function extractPrice(serviceType) {
  console.log('[Price Extraction] Extracting price from:', serviceType);

  // Try exact match first
  for (const [serviceName, priceData] of Object.entries(servicePrice)) {
    if (serviceType.includes(serviceName)) {
      const { price, startingFrom, label } = priceData;

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
function extractNumericPrice(serviceType) {
  for (const [serviceName, priceData] of Object.entries(servicePrice)) {
    if (serviceType.includes(serviceName)) {
      return priceData.price;
    }
  }

  const match = serviceType.match(/\$(\d+)/);
  return match ? parseInt(match[1]) : 0;
}

// Format date string (YYYY-MM-DD) to readable format WITHOUT UTC conversion
function formatBookingDateForEmail(dateStr) {
  try {
    // Parse YYYY-MM-DD string directly (no UTC conversion)
    const [year, month, day] = dateStr.split('-');

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
  const { customerName, customerEmail, bookingDate, bookingTime, serviceType, serviceAddress, hasPhoto } = bookingData;

  // Extract price from service type
  const priceDisplay = extractPrice(serviceType);

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
    Mapleville, RI<br>
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
  const { customerName, customerEmail, customerPhone, bookingDate, bookingTime, serviceType, serviceAddress, vehicleType, notes, hasPhoto } = bookingData;

  // Extract price from service type
  const priceDisplay = extractPrice(serviceType);

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
    <h2>New Booking Received - Geruso Detailing</h2>
    <p>A new booking has been submitted. Here are the complete details:</p>
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
      subject: `New Booking Received - ${customerName} - ${bookingDate}`,
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

module.exports = { sendQuoteEmail, sendBookingConfirmation, sendOwnerNotification, sendOwnerEmail };
