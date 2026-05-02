/**
 * Fix User Passwords Script
 * This script updates the default test user passwords with proper bcrypt hashes
 * Run: node fix-passwords.js
 */

const pool = require('./db');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const testPassword = 'Test1234!';

async function fixPasswords() {
  try {
    console.log('🔐 Fixing user passwords...');

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(testPassword, salt);

    console.log(`Generated bcrypt hash for "${testPassword}"`);
    console.log(`Hash: ${passwordHash}\n`);

    // Update all test users with the correct password hash
    const users = [
      'owner@geruso-detailing.com',
      'dev@geruso-detailing.com',
      'customer@example.com'
    ];

    for (const email of users) {
      const result = await pool.query(
        'UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE email = $2 RETURNING email, role',
        [passwordHash, email]
      );

      if (result.rows.length > 0) {
        console.log(`✅ Updated ${result.rows[0].email} (${result.rows[0].role})`);
      } else {
        console.log(`⚠️  User ${email} not found in database`);
      }
    }

    console.log('\n✅ Password fix complete!');
    console.log(`\nTest with:\n  Email: owner@geruso-detailing.com\n  Password: ${testPassword}`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error fixing passwords:', error.message);
    process.exit(1);
  }
}

fixPasswords();
