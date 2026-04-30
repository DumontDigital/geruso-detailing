const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

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

// API: Handle quote requests
app.post('/api/quote', (req, res) => {
  const { name, phone, vehicle, package: pkg, notes } = req.body;

  // Validate
  if (!name || !phone) {
    return res.status(400).json({ error: 'Name and phone required' });
  }

  // TODO: Send email notification to owner
  // TODO: Save to database
  // For now, just log it
  console.log('Quote request:', { name, phone, vehicle, pkg, notes });

  // Return success
  res.json({
    success: true,
    message: 'Quote request received! We\'ll text you within 30 minutes.',
    timestamp: new Date().toISOString()
  });
});

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
