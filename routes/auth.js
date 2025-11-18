const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();

module.exports = (pool) => {
  // Register new user
  router.post('/register', async (req, res) => {
    const { username, email, password, fullName } = req.body;

    try {
      // Validation
      if (!username || !email || !password) {
        return res.status(400).json({ 
          success: false, 
          message: 'Please provide username, email, and password' 
        });
      }

      // Check if user already exists
      const userExists = await pool.query(
        'SELECT * FROM users WHERE email = $1 OR username = $2',
        [email, username]
      );

      if (userExists.rows.length > 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'User with this email or username already exists' 
        });
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // Insert new user
      const query = `
        INSERT INTO users (username, email, password_hash, full_name)
        VALUES ($1, $2, $3, $4)
        RETURNING id, username, email, full_name, role, created_at
      `;

      const result = await pool.query(query, [
        username,
        email,
        passwordHash,
        fullName || null
      ]);

      const newUser = result.rows[0];

      // Generate JWT token
      const token = jwt.sign(
        { 
          id: newUser.id, 
          username: newUser.username,
          email: newUser.email,
          role: newUser.role 
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
      );

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        token,
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          fullName: newUser.full_name,
          role: newUser.role
        }
      });

    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error registering user',
        error: error.message 
      });
    }
  });

  // Login user
  router.post('/login', async (req, res) => {
    const { emailOrUsername, password } = req.body;

    try {
      // Validation
      if (!emailOrUsername || !password) {
        return res.status(400).json({ 
          success: false, 
          message: 'Please provide email/username and password' 
        });
      }

      // Find user by email or username
      const query = `
        SELECT * FROM users 
        WHERE email = $1 OR username = $1
      `;
      const result = await pool.query(query, [emailOrUsername]);

      if (result.rows.length === 0) {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid credentials' 
        });
      }

      const user = result.rows[0];

      // Check if user is active
      if (!user.is_active) {
        return res.status(403).json({ 
          success: false, 
          message: 'Account is deactivated. Contact administrator.' 
        });
      }

      // Verify password
      const isValidPassword = await bcrypt.compare(password, user.password_hash);

      if (!isValidPassword) {
        return res.status(401).json({ 
          success: false, 
          message: 'Invalid credentials' 
        });
      }

      // Update last login
      await pool.query(
        'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = $1',
        [user.id]
      );

      // Generate JWT token
      const token = jwt.sign(
        { 
          id: user.id, 
          username: user.username,
          email: user.email,
          role: user.role 
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN }
      );

      res.status(200).json({
        success: true,
        message: 'Login successful',
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          fullName: user.full_name,
          role: user.role
        }
      });

    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error logging in',
        error: error.message 
      });
    }
  });

  // Get current user profile
  router.get('/me', async (req, res) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'No token provided' 
      });
    }

    try {
      const verified = jwt.verify(token, process.env.JWT_SECRET);
      
      const query = `
        SELECT id, username, email, full_name, role, is_active, created_at, last_login
        FROM users WHERE id = $1
      `;
      const result = await pool.query(query, [verified.id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ 
          success: false, 
          message: 'User not found' 
        });
      }

      res.status(200).json({
        success: true,
        user: result.rows[0]
      });

    } catch (error) {
      res.status(403).json({ 
        success: false, 
        message: 'Invalid token' 
      });
    }
  });

  return router;
};