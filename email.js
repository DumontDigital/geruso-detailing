const { Resend } = require('resend');
require('dotenv').config();

console.log('[Email Config] Resend API Key:', process.env.RESEND_API_KEY ? 'SET' : 'NOT SET');
console.log('[Email Config] OWNER_EMAIL:', process.env.OWNER_EMAIL);
console.log('[Email Config] FROM_EMAIL:', process.env.FROM_EMAIL);

const resend = new Resend(process.env.RESEND_API_KEY);

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

module.exports = { sendQuoteEmail, sendBookingConfirmation };
