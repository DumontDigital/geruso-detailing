const nodemailer = require('nodemailer');
require('dotenv').config();

console.log('[Email Config] SMTP_HOST:', process.env.SMTP_HOST);
console.log('[Email Config] SMTP_PORT:', process.env.SMTP_PORT);
console.log('[Email Config] SMTP_USER:', process.env.SMTP_USER);
console.log('[Email Config] OWNER_EMAIL:', process.env.OWNER_EMAIL);
console.log('[Email Config] FROM_EMAIL:', process.env.FROM_EMAIL);

const transporter = nodemailer.createTransport({
  service: 'gmail',
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Test transporter connection
transporter.verify((error, success) => {
  if (error) {
    console.error('[Email Error] SMTP connection failed:', error.message);
  } else {
    console.log('[Email] SMTP connection successful');
  }
});

const sendQuoteEmail = async (quoteData) => {
  const { firstName, lastName, email, phone, service, message } = quoteData;

  console.log('[Quote Email] Sending quote email:', { firstName, lastName, email, phone, service });
  console.log('[Quote Email] Recipient (OWNER_EMAIL):', process.env.OWNER_EMAIL);
  console.log('[Quote Email] From (FROM_EMAIL):', process.env.FROM_EMAIL);
  console.log('[Quote Email] SMTP_HOST:', process.env.SMTP_HOST);
  console.log('[Quote Email] SMTP_USER:', process.env.SMTP_USER);

  // Check if environment variables are set
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.error('[Quote Email] FAILED - Missing SMTP configuration');
    console.error('[Quote Email] SMTP_HOST:', process.env.SMTP_HOST ? 'SET' : 'NOT SET');
    console.error('[Quote Email] SMTP_USER:', process.env.SMTP_USER ? 'SET' : 'NOT SET');
    console.error('[Quote Email] SMTP_PASS:', process.env.SMTP_PASS ? 'SET' : 'NOT SET');
    return { success: false, error: 'Email configuration missing. Please contact support.' };
  }

  if (!process.env.OWNER_EMAIL) {
    console.error('[Quote Email] FAILED - OWNER_EMAIL not configured');
    return { success: false, error: 'Email configuration missing. Please contact support.' };
  }

  const htmlContent = `
    <h2>New Quote Request from Geruso Detailing Website</h2>
    <p><strong>Customer Name:</strong> ${firstName} ${lastName}</p>
    <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
    <p><strong>Phone:</strong> <a href="tel:${phone}">${phone}</a></p>
    <p><strong>Service Requested:</strong> ${service}</p>
    <p><strong>Message:</strong></p>
    <p>${message || 'No additional message provided'}</p>
    <hr>
    <p><small>This quote request was submitted via your website. Reply directly to the customer's email or call them.</small></p>
  `;

  try {
    // Create a promise with a 10-second timeout
    const emailPromise = transporter.sendMail({
      from: process.env.FROM_EMAIL,
      to: process.env.OWNER_EMAIL,
      subject: `New Quote Request - ${firstName} ${lastName}`,
      html: htmlContent,
    });

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Email send timeout - SMTP server not responding')), 10000)
    );

    const info = await Promise.race([emailPromise, timeoutPromise]);
    console.log('[Quote Email] SUCCESS - Message ID:', info.messageId);
    return { success: true };
  } catch (error) {
    console.error('[Quote Email] FAILED - Error:', error.message);
    console.error('[Quote Email] Error code:', error.code);
    console.error('[Quote Email] Error response:', error.response);
    return { success: false, error: error.message };
  }
};

const sendBookingConfirmation = async (bookingData) => {
  const { customerName, customerEmail, bookingDate, bookingTime, serviceType, price } = bookingData;

  const htmlContent = `
    <h2>Booking Confirmation - Geruso Detailing</h2>
    <p>Hello ${customerName},</p>
    <p>Thank you for booking with Geruso Detailing! Here are your booking details:</p>
    <hr>
    <p><strong>Service:</strong> ${serviceType}</p>
    <p><strong>Date:</strong> ${new Date(bookingDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
    <p><strong>Time:</strong> ${bookingTime}</p>
    <p><strong>Price:</strong> $${price}</p>
    <hr>
    <p>If you need to reschedule or cancel, please contact us at 401-490-1236.</p>
    <p>We look forward to detailing your vehicle!</p>
    <p><strong>Geruso Detailing</strong><br>
    Mapleville, RI<br>
    401-490-1236</p>
  `;

  try {
    await transporter.sendMail({
      from: process.env.FROM_EMAIL,
      to: customerEmail,
      subject: `Booking Confirmation - ${serviceType}`,
      html: htmlContent,
    });
    return { success: true };
  } catch (error) {
    console.error('Email sending error:', error);
    return { success: false, error: error.message };
  }
};

module.exports = { sendQuoteEmail, sendBookingConfirmation };
