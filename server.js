const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { sendQuoteEmail } = require('./email');
const authRoutes = require('./routes/auth');
const bookingsRoutes = require('./routes/bookings');
const availabilityRoutes = require('./routes/availability');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Serve all HTML pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/services', (req, res) => res.sendFile(path.join(__dirname, 'services.html')));
app.get('/work', (req, res) => res.sendFile(path.join(__dirname, 'work.html')));
app.get('/memberships', (req, res) => res.sendFile(path.join(__dirname, 'memberships.html')));
app.get('/schedule', (req, res) => res.sendFile(path.join(__dirname, 'schedule.html')));
app.get('/reviews', (req, res) => res.sendFile(path.join(__dirname, 'reviews.html')));
app.get('/contact', (req, res) => res.sendFile(path.join(__dirname, 'contact.html')));
app.get('/booking', (req, res) => res.sendFile(path.join(__dirname, 'booking.html')));
app.get('/admin/login', (req, res) => res.sendFile(path.join(__dirname, 'admin-login.html')));
app.get('/admin/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'admin-dashboard.html')));

// API: Handle quote requests
app.post('/api/quote', async (req, res) => {
  const { firstName, lastName, email, phone, service, message } = req.body;

  // Validate
  if (!firstName || !lastName || !email || !phone) {
    return res.status(400).json({ error: 'All required fields must be filled' });
  }

  const quoteData = { firstName, lastName, email, phone, service, message };

  // Send email notification
  const emailResult = await sendQuoteEmail(quoteData);

  if (!emailResult.success) {
    console.error('Failed to send quote email:', emailResult.error);
    return res.status(500).json({
      error: 'Failed to send quote. Please try again or call us directly.'
    });
  }

  // Log quote request
  console.log('Quote request received and emailed:', { firstName, lastName, email, phone, service });

  // Return success
  res.json({
    success: true,
    message: 'Quote request received! We\'ll contact you within 24 hours.',
    timestamp: new Date().toISOString()
  });
});

// Register API routes
app.use('/api/admin', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/availability', availabilityRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'geruso-detailing' });
});

// 404 fallback - serve index for SPA-like behavior
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚗 Geruso Detailing server running on port ${PORT}`);
  console.log(`📍 Visit http://localhost:${PORT}`);
});
