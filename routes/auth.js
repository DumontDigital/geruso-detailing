const express = require('express');
const bcrypt = require('bcryptjs');
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

// Whitelisted staff accounts that sign in with email only (no password).
// SECURITY: anyone who knows these emails gets full owner/dev access — add
// real auth (passwords, 2FA, or SSO) before going to production.
const STAFF_EMAIL_BYPASS = {
  'gerusodetailing@gmail.com': { role: 'owner', first_name: 'Cameron', last_name: 'Geruso' },
  'dumontdigital@gmail.com':   { role: 'dev',   first_name: 'Dumont',  last_name: 'Digital' },
  'dumontdigital1@gmail.com':  { role: 'dev',   first_name: 'Dumont',  last_name: 'Digital' },
};

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email) return res.status(400).json({ error: 'Email required' });

    const lower = String(email).trim().toLowerCase();
    const SECRET = JWT_SECRET || 'your-secret-key';

    // ── Staff passwordless bypass ──────────────────────────────────
    if (STAFF_EMAIL_BYPASS[lower]) {
      const cfg = STAFF_EMAIL_BYPASS[lower];
      let row;
      const existing = await pool.query(
        'SELECT id, email, role, first_name, last_name FROM users WHERE LOWER(email) = $1',
        [lower]
      );
      if (existing.rows.length === 0) {
        const ins = await pool.query(
          `INSERT INTO users (email, password_hash, first_name, last_name, role, is_active)
           VALUES ($1, '!passwordless!', $2, $3, $4, true)
           RETURNING id, email, role, first_name, last_name`,
          [lower, cfg.first_name, cfg.last_name, cfg.role]
        );
        row = ins.rows[0];
      } else {
        row = existing.rows[0];
        if (row.role !== cfg.role) {
          await pool.query('UPDATE users SET role = $1, is_active = true WHERE id = $2', [cfg.role, row.id]);
          row.role = cfg.role;
        }
      }
      const token = jwt.sign({ id: row.id, email: row.email, role: row.role }, SECRET, { expiresIn: JWT_EXPIRY });
      return res.json({
        success: true, token,
        user: { id: row.id, email: row.email, first_name: row.first_name, last_name: row.last_name, role: row.role }
      });
    }

    // ── Normal customer login (password required) ──────────────────
    if (!password) return res.status(400).json({ error: 'Password required' });

    const result = await pool.query(
      'SELECT id, email, password_hash, first_name, last_name, role, is_active FROM users WHERE email = $1',
      [email]
    );
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });

    const user = result.rows[0];
    if (!user.is_active) return res.status(401).json({ error: 'Account is inactive' });

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, SECRET, { expiresIn: JWT_EXPIRY });
    res.json({
      success: true, token,
      user: { id: user.id, email: user.email, first_name: user.first_name, last_name: user.last_name, role: user.role }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Register endpoint (for initial setup only)
router.post('/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create admin
    const result = await pool.query(
      'INSERT INTO admins (id, email, password_hash, is_active) VALUES ($1, $2, $3, $4) RETURNING id, email',
      [uuidv4(), email, passwordHash, true]
    );

    if (result.rows.length === 0) {
      return res.status(500).json({ error: 'Failed to create admin account' });
    }

    res.json({ success: true, message: 'Admin account created' });
  } catch (error) {
    if (error.code === '23505') { // Unique constraint error
      return res.status(400).json({ error: 'Email already registered' });
    }
    console.error('Register error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Forgot password endpoint
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if admin exists
    const result = await pool.query(
      'SELECT id, email FROM admins WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      // Don't reveal if email exists, for security
      return res.json({
        success: true,
        message: 'If an admin account exists with this email, instructions will be sent shortly.'
      });
    }

    // For now, return a message that password reset is not fully connected
    res.json({
      success: true,
      message: 'Password reset is not connected yet. Please contact the site owner at 401-490-1236 to reset your password.',
      contactPhone: '401-490-1236'
    });

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

    // Check if user exists
    const userResult = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    let user;
    if (userResult.rows.length === 0) {
      // Create new user with customer role
      const userId = uuidv4();
      const insertResult = await pool.query(
        'INSERT INTO users (id, email, first_name, last_name, google_id, oauth_provider, role, is_active) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, email, first_name, last_name, role',
        [userId, email, given_name, family_name, sub, 'google', 'customer', true]
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
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
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
