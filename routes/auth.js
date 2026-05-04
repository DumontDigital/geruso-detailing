const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const { OAuth2Client } = require('google-auth-library');
require('dotenv').config();

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = process.env.JWT_EXPIRY || '7d';

// Google OAuth client
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const client = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

// OAuth-only phase: keep a small, explicit allowlist for staff roles.
// Anyone else who signs in with Google becomes a customer.
const STAFF_EMAIL_ROLES = {
  'gerusodetailing@gmail.com': { role: 'owner', first_name: 'Cameron', last_name: 'Geruso' },
  'dumontdigital@gmail.com':   { role: 'dev',   first_name: 'Dumont',  last_name: 'Digital' },
  'dumontdigital1@gmail.com':  { role: 'dev',   first_name: 'Dumont',  last_name: 'Digital' },
};

// Password login disabled (OAuth-only).
router.post('/login', (_req, res) => {
  res.status(410).json({ error: 'Password login disabled. Please sign in with Google.' });
});

// Password registration disabled (OAuth-only).
router.post('/register', async (req, res) => {
  try {
    return res.status(410).json({ error: 'Account creation is via Google sign-in only for now.' });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Password reset disabled (OAuth-only).
router.post('/forgot-password', async (req, res) => {
  try {
    return res.status(410).json({ error: 'Password reset disabled. Please sign in with Google.' });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Google OAuth endpoint
router.post('/google', async (req, res) => {
  try {
    if (!client) {
      return res.status(500).json({ error: 'Google OAuth not configured' });
    }

    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ error: 'ID token is required' });
    }

    // Verify the token
    const ticket = await client.verifyIdToken({
      idToken: idToken,
      audience: GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    const { email, given_name, family_name, sub } = payload;
    if (!email) {
      return res.status(400).json({ error: 'Google account email is required' });
    }
    const lowerEmail = String(email).trim().toLowerCase();

    const staffCfg = STAFF_EMAIL_ROLES[lowerEmail] || null;
    const desiredRole = staffCfg ? staffCfg.role : 'customer';
    const desiredFirst = staffCfg?.first_name || given_name || '';
    const desiredLast = staffCfg?.last_name || family_name || '';

    // Check if user exists
    const userResult = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [lowerEmail]
    );

    let user;
    if (userResult.rows.length === 0) {
      // Create new user with role based on allowlist (staff) or customer (default)
      const userId = uuidv4();
      const insertResult = await pool.query(
        'INSERT INTO users (id, email, first_name, last_name, google_id, oauth_provider, role, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, email, first_name, last_name, role',
        [userId, lowerEmail, desiredFirst, desiredLast, sub, 'google', desiredRole, true]
      );
      user = insertResult.rows[0];
    } else {
      user = userResult.rows[0];
      // Update google_id if not already set
      if (!user.google_id) {
        await pool.query(
          'UPDATE users SET google_id = $1, oauth_provider = $2 WHERE id = $3',
          [sub, 'google', user.id]
        );
      }

      // If this is a staff account, force role + (optionally) name to match allowlist.
      if (staffCfg && user.role !== desiredRole) {
        await pool.query(
          'UPDATE users SET role = $1, is_active = true, first_name = COALESCE(NULLIF($2, \'\'), first_name), last_name = COALESCE(NULLIF($3, \'\'), last_name) WHERE id = $4',
          [desiredRole, desiredFirst, desiredLast, user.id]
        );
        user.role = desiredRole;
      }
    }

    // Generate JWT token
    const SECRET = JWT_SECRET || 'your-secret-key';
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      SECRET,
      { expiresIn: JWT_EXPIRY }
    );

    // Return token and user info
    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        email: user.email,
        name: `${user.first_name} ${user.last_name}`.trim(),
        role: user.role
      },
      message: 'Google sign-in successful'
    });

  } catch (error) {
    console.error('Google OAuth error:', error);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
});

module.exports = router;
