const jwt = require('jsonwebtoken');
require('dotenv').config();

const verifyToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  // Use same fallback secret routes/auth.js uses when signing — otherwise
  // tokens signed with the fallback never verify and every admin endpoint
  // returns 401 (which is why the Delete button silently failed).
  const SECRET = process.env.JWT_SECRET || 'your-secret-key';
  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    req.admin = decoded;
    next();
  });
};

module.exports = { verifyToken };
