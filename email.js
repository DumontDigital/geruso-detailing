const nodemailer = require('nodemailer');
require('dotenv').config();

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

const sendQuoteEmail = async (quoteData) => {
  const { firstName, lastName, email, phone, service, message } = quoteData;

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
    await transporter.sendMail({
      from: process.env.FROM_EMAIL,
      to: process.env.OWNER_EMAIL,
      subject: `New Quote Request - ${firstName} ${lastName}`,
      html: htmlContent,
    });
    return { success: true };
  } catch (error) {
    console.error('Email sending error:', error);
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
