// Load environment variables first
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { nanoid } = require('nanoid');
const { createServer } = require('http');
const { Server } = require('socket.io');
const PyTorchPredictor = require('./ai/PyTorchPredictor');
const NotificationService = require('./services/NotificationService');
const AdvancedNotificationService = require('./services/AdvancedNotificationService');
const VoiceInputService = require('./services/VoiceInputService');
const BlockchainService = require('./services/BlockchainService');
const ARService = require('./services/ARService');
const MarketplaceService = require('./services/MarketplaceService');
const DatabaseService = require('./services/DatabaseService');

const pytorchPredictor = new PyTorchPredictor();
const notificationService = new NotificationService();
const advancedNotificationService = new AdvancedNotificationService();
const voiceService = new VoiceInputService();
const blockchainService = new BlockchainService();
const arService = new ARService();
const marketplaceService = new MarketplaceService();
pytorchPredictor.loadModel().catch(console.error);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

const port = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const DATA_DIR = process.env.VERCEL ? '/tmp/data' : path.join(__dirname, '..', 'data');
const IMAGES_DIR = process.env.VERCEL ? '/tmp/images' : path.join(DATA_DIR, 'images');

// Initialize Database Service (Supabase ONLY - no JSON fallback)
let db;
try {
  db = new DatabaseService();
  console.log('✅ DatabaseService initialized successfully');
} catch (error) {
  console.error('❌ Failed to initialize DatabaseService:', error.message);
  console.error('❌ Error:', error);
  // Don't throw here - let routes handle the error gracefully
  // This allows the server to start even if DB connection fails initially
  db = null;
}

// Socket.IO authentication and real-time updates
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error'));
  
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    socket.userId = payload.sub;
    socket.userRole = payload.role;
    next();
  } catch (err) {
    next(new Error('Authentication error'));
  }
});

io.on('connection', (socket) => {
  console.log(`User ${socket.userId} connected`);
  
  socket.on('join_room', (room) => {
    socket.join(room);
    console.log(`User ${socket.userId} joined room ${room}`);
  });
  
  socket.on('disconnect', () => {
    console.log(`User ${socket.userId} disconnected`);
  });
});

// Helper function to broadcast updates
function broadcastUpdate(type, data, room = 'all') {
  io.to(room).emit('update', { type, data, timestamp: new Date().toISOString() });
}



// Ensure directories exist (skip on Vercel as it's read-only)
if (!process.env.VERCEL) {
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(IMAGES_DIR));

const upload = multer({ storage: multer.memoryStorage() });

// Data persistence functions
// Database functions - Supabase ONLY (no JSON fallback)
async function getUsers() { 
  if (!db) {
    console.error('❌ getUsers() called but database service not initialized');
    throw new Error('Database service not initialized. Please check Supabase credentials in Vercel environment variables.');
  }
  return await db.getUsers();
}

async function getAnimals() { 
  return await db.getAnimals();
}

async function getLogs() { 
  return await db.getLogs();
}

async function getBreeds() { 
  return await db.getBreeds();
}

// JWT functions
function createToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
}

async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    console.error('❌ No token provided for:', req.path);
    return res.status(401).json({ error: 'No token' });
  }
  
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Get full user data
    const users = await getUsers();
    const user = users.find(u => u.id === decoded.sub);
    
    if (!user) {
      console.error('❌ User not found in database:', decoded.sub);
      // Don't block the request - allow it to proceed with token data
      // This handles cases where user was created before Supabase migration
      req.user = {
        ...decoded,
        role: decoded.role || 'user'
      };
      console.warn('⚠️  Proceeding with token-only user data for:', decoded.sub);
    } else {
      req.user = {
        ...decoded,
        role: user.role,
        name: user.name,
        email: user.email
      };
    }
    
    next();
  } catch (error) {
    console.error('❌ Token verification failed:', error.message);
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired. Please login again.' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token. Please login again.' });
    }
    res.status(401).json({ error: 'Invalid token' });
  }
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized: No user found' });
    }
    if (!roles.includes(req.user.role)) {
      console.error(`Access denied: User ${req.user.sub} (${req.user.role}) attempted to access ${req.path} requiring roles: ${roles.join(', ')}`);
      return res.status(403).json({ error: 'Forbidden: Insufficient permissions. Admin access required.' });
    }
    next();
  };
}

async function logActivity(action, data) {
  try {
    const log = {
      id: nanoid(),
      action,
      data: typeof data === 'object' ? data : { message: data },
      timestamp: new Date().toISOString(),
      user_id: data?.userId || data?.createdBy || data?.updatedBy || data?.deletedBy || null
    };
    await db.createLog(log).catch((e) => {
      console.error('❌ Error logging activity to Supabase:', e);
      // Don't throw - logging failures shouldn't break the app
    });
  } catch (e) {
    console.error('Error logging activity:', e);
  }
}

// Seed admin user (async - don't block server startup)
getUsers().then(users => {
  if (users.length === 0) {
    const adminUser = {
      id: nanoid(),
      name: 'Admin',
      email: 'admin@example.com',
      role: 'admin',
      password_hash: bcrypt.hashSync('password123', 10),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_active: true,
      permissions: ['all']
    };
    db.createUser(adminUser).catch(e => {
      console.error('Error creating admin user:', e);
    });
  }
}).catch(e => {
  console.error('Error checking for admin user:', e);
});

// OTP Authentication routes
app.post('/api/auth/send-otp', (req, res) => {
  try {
    const { phone } = req.body;
    
    if (!phone || !/^[6-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ error: 'Invalid mobile number' });
    }
    
    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    // In a real system, you would send SMS here
    // For now, we'll store it temporarily and log it
    console.log(`📱 OTP for ${phone}: ${otp}`);
    
    // Store OTP temporarily (in production, use Redis or similar)
    const otpData = {
      phone,
      otp,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
      attempts: 0
    };
    
    // Simple in-memory storage (replace with Redis in production)
    if (!global.otpStorage) global.otpStorage = new Map();
    global.otpStorage.set(phone, otpData);
    
    // Check if user exists
    const users = getUsers();
    const existingUser = users.find(u => u.phone === phone);
    
    if (existingUser) {
      logActivity('auth.otp_sent_existing', { phone, userId: existingUser.id });
    } else {
      logActivity('auth.otp_sent_new', { phone });
    }
    
    res.json({ 
      success: true, 
      message: 'OTP sent successfully',
      // In development, return OTP for testing
      ...(process.env.NODE_ENV === 'development' && { otp })
    });
  } catch (e) {
    console.error('Send OTP error:', e);
    res.status(500).json({ error: 'Failed to send OTP' });
  }
});

app.post('/api/auth/verify-otp', (req, res) => {
  try {
    const { phone, otp } = req.body;
    
    if (!phone || !otp || otp.length !== 6) {
      return res.status(400).json({ error: 'Invalid phone number or OTP' });
    }
    
    // Get stored OTP data
    if (!global.otpStorage) global.otpStorage = new Map();
    const otpData = global.otpStorage.get(phone);
    
    if (!otpData) {
      return res.status(400).json({ error: 'OTP not found or expired' });
    }
    
    // Check if OTP expired
    if (new Date() > otpData.expiresAt) {
      global.otpStorage.delete(phone);
      return res.status(400).json({ error: 'OTP expired' });
    }
    
    // Check attempts
    if (otpData.attempts >= 3) {
      global.otpStorage.delete(phone);
      return res.status(400).json({ error: 'Too many attempts. Please request new OTP' });
    }
    
    // Verify OTP
    if (otpData.otp !== otp) {
      otpData.attempts++;
      global.otpStorage.set(phone, otpData);
      return res.status(400).json({ error: 'Invalid OTP' });
    }
    
    // OTP verified successfully
    global.otpStorage.delete(phone);
    
    // Check if user exists
    const users = getUsers();
    const existingUser = users.find(u => u.phone === phone);
    
    if (existingUser) {
      // Ensure user has permissions set based on role
      if (!existingUser.permissions || existingUser.permissions.length === 0) {
        existingUser.permissions = getRolePermissions(existingUser.role || 'user');
      }
      
      // User exists, create token and login
      const token = createToken(existingUser);
      logActivity('auth.otp_login_success', { phone, userId: existingUser.id });
      
      res.json({
        success: true,
        token,
        user: {
          id: existingUser.id,
          name: existingUser.name,
          email: existingUser.email,
          phone: existingUser.phone,
          role: existingUser.role,
          village: existingUser.village,
          district: existingUser.district,
          state: existingUser.state,
          permissions: existingUser.permissions || getRolePermissions(existingUser.role || 'user')
        }
      });
    } else {
      // New user, require password setup
      const tempData = {
        phone,
        verifiedAt: new Date().toISOString(),
        tempId: nanoid()
      };
      
      logActivity('auth.otp_verified_new_user', { phone });
      
      res.json({
        success: true,
        message: 'OTP verified. Please set up your password.',
        tempData
      });
    }
  } catch (e) {
    console.error('Verify OTP error:', e);
    res.status(500).json({ error: 'Failed to verify OTP' });
  }
});

app.post('/api/auth/setup-password', async (req, res) => {
  try {
    const { phone, password, tempData } = req.body;
    
    if (!phone || !password || !tempData) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    
    // Check if user already exists
    const users = await getUsers();
    if (users.find(u => u.phone === phone)) {
      return res.status(400).json({ error: 'User already exists' });
    }
    
    // Create new user
    const user = {
      id: nanoid(),
      phone,
      passwordHash: bcrypt.hashSync(password, 10),
      role: 'user', // Default role
      created_at: new Date().toISOString(), // Use snake_case for Supabase
      is_active: true,
      permissions: getRolePermissions('user'),
      biometricEnabled: false
    };
    
    await db.createUser(user);
    
    const token = createToken(user);
    await logActivity('auth.password_setup_success', { phone, userId: user.id });
    
    res.status(201).json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name || '',
        email: user.email || '',
        phone: user.phone,
        role: user.role,
        permissions: user.permissions
      }
    });
  } catch (e) {
    console.error('Setup password error:', e);
    res.status(500).json({ error: 'Failed to setup password' });
  }
});

app.post('/api/auth/resend-otp', (req, res) => {
  try {
    const { phone } = req.body;
    
    if (!phone || !/^[6-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ error: 'Invalid mobile number' });
    }
    
    // Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    console.log(`📱 Resent OTP for ${phone}: ${otp}`);
    
    const otpData = {
      phone,
      otp,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      attempts: 0
    };
    
    if (!global.otpStorage) global.otpStorage = new Map();
    global.otpStorage.set(phone, otpData);
    
    logActivity('auth.otp_resent', { phone });
    
    res.json({ 
      success: true, 
      message: 'OTP resent successfully',
      ...(process.env.NODE_ENV === 'development' && { otp })
    });
  } catch (e) {
    console.error('Resend OTP error:', e);
    res.status(500).json({ error: 'Failed to resend OTP' });
  }
});

// Auth routes
app.post('/api/auth/register', async (req, res) => {
  try {
    const { 
      name, 
      email, 
      phone,
      password
    } = req.body || {};
    
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }
    
    // Registration always creates 'user' role - admins must be created separately
    const role = 'user';
    
    const users = await getUsers();
    if (users.find(u => u.email === email)) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    if (phone && users.find(u => u.phone === phone)) {
      return res.status(400).json({ error: 'Phone number already exists' });
    }
    
    const user = { 
      id: nanoid(), 
      name, 
      email, 
      phone,
      role, 
      password_hash: bcrypt.hashSync(password, 10),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      is_active: true,
      permissions: getRolePermissions(role)
    };
    
    await db.createUser(user);
    console.log('✅ User registered in Supabase:', user.email);
    await logActivity('auth.register', { userId: user.id, role: user.role });
    
    const token = createToken(user);
    res.status(201).json({ 
      token, 
      user: { 
        id: user.id, 
        name: user.name, 
        email: user.email, 
        phone: user.phone,
        role: user.role,
        permissions: user.permissions
      } 
    });
  } catch (e) {
    console.error('Register error:', e);
    res.status(500).json({ error: 'Internal server error. Please try again later.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    // Check if database is initialized
    if (!db) {
      console.error('❌ Database service not initialized');
      return res.status(500).json({ 
        error: 'Database service not available',
        details: 'The database connection failed to initialize. Please check your Supabase credentials in Vercel environment variables.'
      });
    }
    
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    const users = await getUsers();
    const user = users.find(u => u.email === email);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const passwordHash = user.password_hash || user.passwordHash;
    if (!passwordHash || !bcrypt.compareSync(password, passwordHash)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    // Ensure user is synced to Supabase (non-blocking)
    if (process.env.USE_SUPABASE === 'true' && db) {
      try {
        const supabaseUsers = await db.getUsers();
        const existsInSupabase = supabaseUsers.some(u => u.id === user.id);
        if (!existsInSupabase) {
          // Sync user to Supabase
          db.createUser({
            id: user.id,
            email: user.email,
            password_hash: user.password_hash || user.passwordHash,
            name: user.name,
            role: user.role || 'user',
            phone: user.phone || null,
            is_active: user.is_active !== undefined ? user.is_active : (user.isActive !== undefined ? user.isActive : true),
            permissions: user.permissions || [],
            created_at: user.created_at || user.createdAt || new Date().toISOString(),
            updated_at: user.updated_at || user.updatedAt || new Date().toISOString()
          }).then(() => {
            console.log('✅ Synced user to Supabase on login:', user.email);
          }).catch(e => {
            console.log('⚠️  Could not sync user to Supabase on login:', user.email, e.message);
          });
        }
      } catch (syncError) {
        console.error('⚠️  Error syncing user to Supabase:', syncError.message);
        // Don't fail login if sync fails
      }
    }
    
    // Ensure user has permissions set based on role
    if (!user.permissions || user.permissions.length === 0) {
      user.permissions = getRolePermissions(user.role || 'user');
      // Update user in database with permissions (non-blocking)
      if (db && typeof db.updateUser === 'function') {
        try {
          await db.updateUser(user.id, { permissions: user.permissions });
        } catch (updateError) {
          console.warn('⚠️  Could not update user permissions:', updateError.message);
        }
      }
    }
    
    const token = createToken(user);
    logActivity('auth.login', { userId: user.id }).catch(console.error);
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        name: user.name, 
        email: user.email, 
        role: user.role,
        permissions: user.permissions || getRolePermissions(user.role || 'user')
      } 
    });
  } catch (e) {
    console.error('Login error:', e);
    console.error('Login error stack:', e.stack);
    res.status(500).json({ error: 'Internal error during login', details: e.message });
  }
});

// Profile endpoints
app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    const users = await getUsers();
    const user = users.find(u => u.id === req.user.sub);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({
      id: user.id,
      name: user.name,
      email: user.email || '',
      phone: user.phone || '',
      role: user.role,
      region: user.region || user.location || '',
      language: user.language || 'en',
      photoUrl: user.photo_url || user.photoUrl || user.profile_photo || null,
      permissions: user.permissions || []
    });
  } catch (e) {
    console.error('Error fetching profile:', e);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

app.put('/api/me', authMiddleware, upload.single('photo'), async (req, res) => {
  try {
    const { name, phone, region, language } = req.body || {};
    const users = await getUsers();
    const user = users.find(u => u.id === req.user.sub);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (phone !== undefined) updates.phone = phone;
    if (region !== undefined) updates.region = region;
    // Note: language column doesn't exist in Supabase schema, so we'll skip it
    // if (language !== undefined) updates.language = language;
    updates.updated_at = new Date().toISOString();
    
    // Handle profile photo upload - try different column names
    let photoUrl = null;
    if (req.file) {
      try {
        // Ensure images directory exists
        if (!fs.existsSync(IMAGES_DIR)) {
          fs.mkdirSync(IMAGES_DIR, { recursive: true });
        }
        
        const photoId = nanoid();
        const ext = path.extname(req.file.originalname || '.jpg') || '.jpg';
        const fileName = `profile_${req.user.sub}_${photoId}${ext}`;
        const filePath = path.join(IMAGES_DIR, fileName);
        fs.writeFileSync(filePath, req.file.buffer);
        photoUrl = `/uploads/${fileName}`;
        
        // Try to update photo_url column (if it exists in database)
        // If column doesn't exist, we'll catch the error and continue
        updates.photo_url = photoUrl;
      } catch (photoError) {
        console.warn('⚠️  Error saving profile photo file:', photoError.message);
        // Continue without photo update
      }
    }
    
    // Update user - handle photo_url column error gracefully
    let updatedUser;
    try {
      updatedUser = await db.updateUser(req.user.sub, updates);
    } catch (updateError) {
      // If error is about photo_url column not existing, try again without it
      if (updateError.message && updateError.message.includes('photo_url')) {
        console.warn('⚠️  photo_url column not found, updating without photo');
        const updatesWithoutPhoto = { ...updates };
        delete updatesWithoutPhoto.photo_url;
        updatedUser = await db.updateUser(req.user.sub, updatesWithoutPhoto);
        // Store photo URL in response even if column doesn't exist
        if (photoUrl) {
          updatedUser.photo_url = photoUrl;
        }
      } else {
        throw updateError;
      }
    }
    res.json({
      id: updatedUser.id,
      name: updatedUser.name,
      email: updatedUser.email || '',
      phone: updatedUser.phone || '',
      role: updatedUser.role,
      region: updatedUser.region || '',
      language: language || 'en',
      photoUrl: updatedUser.photo_url || updatedUser.photoUrl || photoUrl || null
    });
  } catch (e) {
    console.error('Error updating profile:', e);
    res.status(500).json({ error: 'Failed to update profile: ' + (e.message || 'Unknown error') });
  }
});

// Biometric authentication endpoint
app.post('/api/auth/biometric', (req, res) => {
  try {
    const { credential, email } = req.body || {};
    if (!credential || !email) return res.status(400).json({ error: 'Credential and email required' });
    
    const users = getUsers();
    const user = users.find(u => u.email === email);
    if (!user) return res.status(401).json({ error: 'User not found' });
    
    if (!user.biometricEnabled) return res.status(403).json({ error: 'Biometric authentication not enabled for this user' });
    
    // In a real implementation, you would verify the credential against stored biometric data
    // For now, we'll simulate successful authentication
    const token = createToken(user);
    logActivity('auth.biometric_login', { userId: user.id });
    
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        name: user.name, 
        email: user.email, 
        role: user.role,
        village: user.village,
        district: user.district,
        state: user.state,
        permissions: user.permissions
      } 
    });
  } catch (e) {
    console.error('Biometric auth error:', e);
    res.status(500).json({ error: 'Internal error during biometric authentication' });
  }
});

// Test route
app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is working!' });
});

// Animal routes
app.get('/api/animals', authMiddleware, async (req, res) => {
  try {
    const animals = await getAnimals();
    const user = req.user;
    
    console.log(`📊 Fetching animals for user: ${user.sub}, role: ${user.role}`);
    console.log(`📊 Total animals in database: ${animals.length}`);
    
    // Filter animals based on user role
    let filteredAnimals = animals;
    
    if (user.role === 'user') {
      // Users can only see their own records
      // Also show records with null created_by (legacy records or records created before user tracking)
      filteredAnimals = animals.filter(animal => {
        const createdBy = animal.created_by || animal.createdBy;
        // Show if created by this user OR if created_by is null (legacy records)
        const matches = createdBy === user.sub || createdBy === null || createdBy === undefined;
        if (!matches) {
          console.log(`⚠️  Animal ${animal.id} created by ${createdBy}, user is ${user.sub} - filtered out`);
        }
        return matches;
      });
      console.log(`📊 Filtered animals for user: ${filteredAnimals.length}`);
    } else if (user.role === 'admin') {
      // Admin can see all records (including those with null created_by)
      console.log(`📊 Admin user - showing all ${animals.length} animals`);
    } else {
      console.warn(`⚠️  Unknown user role: ${user.role}`);
    }
    
    // Fetch users to get user names for createdBy fields
    let userMap = {};
    try {
      const users = await getUsers();
      userMap = users.reduce((acc, u) => {
        acc[u.id] = u.name || u.email || 'Unknown User';
        return acc;
      }, {});
      console.log(`👥 Loaded ${users.length} users for name lookup`);
    } catch (userError) {
      console.warn('⚠️  Could not load users for name lookup:', userError.message);
      // Continue without user names - frontend will show IDs
    }
    
    // Map snake_case to camelCase for frontend compatibility
    const mappedAnimals = filteredAnimals.map(animal => {
      const createdBy = animal.created_by || animal.createdBy;
      return {
        id: animal.id,
        createdAt: animal.created_at || animal.createdAt,
        createdBy: createdBy,
        createdByName: createdBy ? (userMap[createdBy] || null) : null,
        updatedAt: animal.updated_at || animal.updatedAt,
        updatedBy: animal.updated_by || animal.updatedBy,
        status: animal.status || 'pending',
        ownerName: animal.owner_name || animal.ownerName || '',
        earTag: animal.ear_tag || animal.earTag || '',
        location: animal.location || '',
        notes: animal.notes || '',
        predictedBreed: animal.predicted_breed || animal.predictedBreed || animal.breed || '',
        breed: animal.breed || animal.predicted_breed || animal.predictedBreed || '',
        ageMonths: animal.age_months || animal.ageMonths || null,
        gender: animal.gender || '',
        imageUrls: animal.image_urls || animal.imageUrls || animal.images || [],
        images: animal.image_urls || animal.imageUrls || animal.images || [],
        gps: animal.gps || null,
        capturedAt: animal.captured_at || animal.capturedAt || null,
        species: animal.species || '',
        healthStatus: animal.health_status || animal.healthStatus || 'healthy',
        vaccinationStatus: animal.vaccination_status || animal.vaccinationStatus || 'unknown',
        weight: animal.weight || null,
        approvedBy: animal.approved_by || animal.approvedBy || null,
        approvedAt: animal.approved_at || animal.approvedAt || null
      };
    });
    
    console.log(`✅ Returning ${mappedAnimals.length} animals to frontend`);
    res.json(mappedAnimals);
  } catch (e) {
    console.error('❌ Error fetching animals:', e);
    console.error('Error stack:', e.stack);
    res.status(500).json({ error: 'Failed to load records', details: e.message });
  }
});

// Get single animal by ID
app.get('/api/animals/:id', authMiddleware, async (req, res) => {
  try {
    const animals = await getAnimals();
    const animal = animals.find(a => a.id === req.params.id);
    
    if (!animal) {
      return res.status(404).json({ error: 'Animal record not found' });
    }
    
    // Check permissions - users can only see their own records
    const user = req.user;
    const createdBy = animal.created_by || animal.createdBy;
    
    if (user.role === 'user' && createdBy !== user.sub && createdBy !== null && createdBy !== undefined) {
      return res.status(403).json({ error: 'Permission denied. You can only view your own records.' });
    }
    
    // Map to frontend-compatible format
    res.json({
      id: animal.id,
      createdAt: animal.created_at || animal.createdAt,
      createdBy: animal.created_by || animal.createdBy,
      updatedAt: animal.updated_at || animal.updatedAt,
      updatedBy: animal.updated_by || animal.updatedBy,
      status: animal.status || 'pending',
      ownerName: animal.owner_name || animal.ownerName || '',
      earTag: animal.ear_tag || animal.earTag || '',
      location: animal.location || '',
      notes: animal.notes || '',
      predictedBreed: animal.predicted_breed || animal.predictedBreed || animal.breed || '',
      breed: animal.breed || animal.predicted_breed || animal.predictedBreed || '',
      ageMonths: animal.age_months || animal.ageMonths || null,
      gender: animal.gender || '',
      healthStatus: animal.health_status || animal.healthStatus || 'healthy',
      vaccinationStatus: animal.vaccination_status || animal.vaccinationStatus || 'unknown',
      weight: animal.weight || null,
      imageUrls: animal.image_urls || animal.imageUrls || animal.images || [],
      images: animal.image_urls || animal.imageUrls || animal.images || [],
      gps: animal.gps || null,
      capturedAt: animal.captured_at || animal.capturedAt || null,
      species: animal.species || '',
      approvedBy: animal.approved_by || animal.approvedBy || null,
      approvedAt: animal.approved_at || animal.approvedAt || null
    });
  } catch (e) {
    console.error('Error fetching animal:', e);
    res.status(500).json({ error: 'Failed to fetch animal record' });
  }
});

app.post('/api/animals', authMiddleware, upload.array('images', 6), async (req, res) => {
  try {
    const { 
      ownerName = '', owner_name = '', location = '', notes = '', 
      predictedBreed = '', predicted_breed = '', 
      breedConfidence = '', breed_confidence = '',
      species = '', speciesConfidence = '', species_confidence = '',
      ageMonths = '', age_months = '', gender = '', 
      gpsLat = '', gpsLng = '', capturedAt = '', earTag = '', ear_tag = '',
      healthStatus = '', health_status = '', vaccinationStatus = '', vaccination_status = '',
      weight = '', weight_kg = '',
      predictionData = null // Full prediction response from frontend
    } = req.body || {};
    
    // Debug: Log received health/vaccination data
    console.log('📥 Received form data:', {
      healthStatus: healthStatus || health_status,
      vaccinationStatus: vaccinationStatus || vaccination_status,
      weight: weight || weight_kg,
      allBodyKeys: Object.keys(req.body || {})
    });
    
    const id = nanoid();
    const imageUrls = [];
    
    // Handle image uploads with error handling
    if (Array.isArray(req.files) && req.files.length > 0) {
      // Ensure images directory exists
      if (!fs.existsSync(IMAGES_DIR)) {
        fs.mkdirSync(IMAGES_DIR, { recursive: true });
      }
      
      for (let i = 0; i < req.files.length; i++) {
        const f = req.files[i];
        try {
          // Validate file
          if (!f.buffer || f.buffer.length === 0) {
            console.warn(`⚠️  Image ${i} has no buffer data, skipping`);
            continue;
          }
          
          // Validate file size (max 10MB)
          if (f.buffer.length > 10 * 1024 * 1024) {
            console.warn(`⚠️  Image ${i} is too large (${(f.buffer.length / 1024 / 1024).toFixed(2)}MB), skipping`);
            continue;
          }
          
          const ext = path.extname(f.originalname || '.jpg') || '.jpg';
          const fileName = `${id}_${i}${ext}`;
          const filePath = path.join(IMAGES_DIR, fileName);
          
          // Write file with error handling
          fs.writeFileSync(filePath, f.buffer);
          imageUrls.push(`/uploads/${fileName}`);
          console.log(`✅ Saved image ${i}: ${fileName}`);
        } catch (imageError) {
          console.error(`❌ Error saving image ${i}:`, imageError.message);
          // Continue with other images even if one fails
        }
      }
    } else if (!req.files || req.files.length === 0) {
      // No images uploaded - this is allowed but log it
      console.warn('⚠️  No images uploaded with animal record');
    }
    
    // Calculate age_months from years and months if provided separately
    let ageMonthsValue = null;
    if (ageMonths || age_months) {
      ageMonthsValue = Number(ageMonths || age_months);
    }
    
    // Extract health and vaccination status - handle empty strings and FormData properly
    // FormData sends empty strings, so we need to check for both undefined and empty string
    const healthStatusRaw = healthStatus || health_status || '';
    const healthStatusValue = (typeof healthStatusRaw === 'string' && healthStatusRaw.trim()) ? healthStatusRaw.trim() : 'healthy';
    
    const vaccinationStatusRaw = vaccinationStatus || vaccination_status || '';
    const vaccinationStatusValue = (typeof vaccinationStatusRaw === 'string' && vaccinationStatusRaw.trim()) ? vaccinationStatusRaw.trim() : 'unknown';
    
    const weightRaw = weight || weight_kg || '';
    const weightValue = (typeof weightRaw === 'string' && weightRaw.trim()) ? weightRaw.trim() : '';
    
    const animal = {
      id,
      created_at: new Date().toISOString(),
      created_by: req.user?.sub || null,
      status: 'pending',
      owner_name: ownerName || owner_name || '',
      ear_tag: earTag || ear_tag || '',
      location: location || '',
      notes: notes || '',
      predicted_breed: predictedBreed || predicted_breed || '',
      breed: predictedBreed || predicted_breed || '',
      age_months: ageMonthsValue,
      gender: gender || '',
      health_status: healthStatusValue,
      vaccination_status: vaccinationStatusValue,
      weight: weightValue ? (isNaN(weightValue) ? null : Number(weightValue)) : null,
      image_urls: imageUrls,
      images: imageUrls,
      gps: (gpsLat && gpsLng) ? { lat: Number(gpsLat), lng: Number(gpsLng) } : null,
      captured_at: capturedAt || new Date().toISOString(),
    };
    
    // Log the animal data being saved for debugging
    console.log('📋 Animal data being saved:', {
      id: animal.id,
      health_status: animal.health_status,
      vaccination_status: animal.vaccination_status,
      weight: animal.weight,
      owner_name: animal.owner_name
    });
    
    // Automatically save new breed if predicted and doesn't exist
    // Use ONLY model prediction data - no database lookups or defaults
    const predictedBreedName = predictedBreed || predicted_breed;
    if (predictedBreedName) {
      try {
        const existingBreeds = await getBreeds();
        const breedExists = existingBreeds.some(b => 
          b.name.toLowerCase().trim() === predictedBreedName.toLowerCase().trim()
        );
        
        if (!breedExists) {
          // Extract breed information DIRECTLY from model prediction
          // Parse prediction data if provided, or use available request data
          let predictionInfo = null;
          if (predictionData) {
            if (typeof predictionData === 'string') {
              try {
                predictionInfo = JSON.parse(predictionData);
              } catch (e) {
                console.warn('Could not parse predictionData string:', e.message);
                // Try to extract from string if it's not valid JSON
                try {
                  predictionInfo = JSON.parse(decodeURIComponent(predictionData));
                } catch (e2) {
                  console.warn('Could not parse predictionData after decode:', e2.message);
                }
              }
            } else if (typeof predictionData === 'object') {
              predictionInfo = predictionData;
            }
          }
          
          // Log prediction info for debugging
          if (predictionInfo) {
            console.log('📊 Using prediction data:', {
              hasPredictions: !!predictionInfo.predictions,
              species: predictionInfo.species,
              speciesConfidence: predictionInfo.speciesConfidence
            });
          } else {
            console.log('⚠️  No prediction info available, using form data only');
          }
          
          // Extract breed information DIRECTLY from model prediction ONLY
          // No database lookups, no defaults, no inference - only what the model predicts
          const topPrediction = predictionInfo?.predictions?.[0] || null;
          const confidence = topPrediction?.confidence || parseFloat(breedConfidence || breed_confidence || 0);
          const detectedSpecies = predictionInfo?.species || species || null; // Use model prediction, or null if not provided
          const speciesConf = predictionInfo?.speciesConfidence || parseFloat(speciesConfidence || species_confidence || 0);
          
          // Extract breed name (remove suffixes like "(Cattle)" or "(Buffalo)" if present)
          const cleanBreedName = predictedBreedName.replace(/\s*\(.*?\)\s*/g, '').trim();
          
          // Use species from model prediction ONLY - no inference
          // If model says "cattle_or_buffalo", use that exactly (don't infer)
          const finalSpecies = detectedSpecies || null; // Use exactly what model predicts, or null
          
          // Create breed record using ONLY model prediction data - no defaults, no lookups
          const newBreed = {
            id: nanoid(),
            name: cleanBreedName, // From model prediction
            origin: null, // Model doesn't provide - leave null (not empty string)
            description: detectedSpecies 
              ? `AI-detected breed from model prediction. Species: ${detectedSpecies}. Breed confidence: ${(confidence * 100).toFixed(1)}%`
              : `AI-detected breed from model prediction. Breed confidence: ${(confidence * 100).toFixed(1)}%`,
            avg_milk_yield: null, // Model doesn't provide - leave null
            avg_weight: null, // Model doesn't provide - leave null
            characteristics: [
              `Model Prediction: ${(confidence * 100).toFixed(1)}% confidence`,
              ...(detectedSpecies ? [`Species: ${detectedSpecies}`, `Species Confidence: ${(speciesConf * 100).toFixed(1)}%`] : []),
              ...(predictionInfo?.isCrossbreed ? ['Crossbreed detected'] : []),
              'AI-detected from model'
            ],
            species: finalSpecies, // Use exactly what model predicts (can be null)
            image_url: imageUrls[0] || null, // From uploaded image
            notes: `Auto-detected from model prediction on ${new Date().toLocaleString()}. ` +
                   `Breed: ${cleanBreedName} (${(confidence * 100).toFixed(1)}% confidence). ` +
                   (detectedSpecies ? `Species: ${detectedSpecies} (${(speciesConf * 100).toFixed(1)}% confidence). ` : '') +
                   `All information derived directly from AI model prediction - no database lookups, no defaults, no inference used.`,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };
          
          await db.createBreed(newBreed);
          console.log('✅ Auto-saved new breed to Supabase using ONLY model prediction data:', cleanBreedName);
          console.log('📋 Breed details from prediction:', JSON.stringify(newBreed, null, 2));
        } else {
          console.log('ℹ️  Breed already exists:', predictedBreedName);
        }
      } catch (breedCheckError) {
        console.error('❌ Error checking/saving breed:', breedCheckError);
        // Don't throw - breed creation failure shouldn't prevent animal from being saved
      }
    }
    
    let savedAnimal;
    try {
      console.log('💾 Attempting to save animal to Supabase:', animal.id, 'Owner:', animal.owner_name);
      console.log('💾 Health/Vaccination data:', {
        health_status: animal.health_status,
        vaccination_status: animal.vaccination_status,
        weight: animal.weight
      });
      savedAnimal = await db.createAnimal(animal);
      console.log('✅ Animal saved successfully to Supabase:', savedAnimal.id);
      console.log('✅ Saved animal health/vaccination data:', {
        health_status: savedAnimal.health_status,
        vaccination_status: savedAnimal.vaccination_status,
        weight: savedAnimal.weight
      });
    } catch (dbError) {
      console.error('❌ Error saving animal to Supabase:', dbError);
      console.error('❌ Error details:', dbError.message, dbError.code, dbError.details);
      console.error('❌ Error hint:', dbError.hint);
      
      // Check if error is about missing columns
      if (dbError.message && (dbError.message.includes('column') || dbError.message.includes('does not exist'))) {
        console.error('⚠️  Database column error detected. Please ensure these columns exist in Supabase:');
        console.error('   - health_status (TEXT)');
        console.error('   - vaccination_status (TEXT)');
        console.error('   - weight (NUMERIC)');
      }
      
      throw dbError; // Supabase is the only database - no fallback
    }
    
    // Log activity (don't await to avoid blocking)
    logActivity('animal.create', { id: animal.id, userId: req.user?.sub }).catch(console.error);
    
    // Broadcast real-time update
    broadcastUpdate('animal_created', savedAnimal);
    
    // Return response in format expected by frontend
    res.status(201).json({
      id: savedAnimal.id,
      createdAt: savedAnimal.created_at || savedAnimal.createdAt,
      createdBy: savedAnimal.created_by || savedAnimal.createdBy,
      status: savedAnimal.status,
      ownerName: savedAnimal.owner_name || savedAnimal.ownerName,
      location: savedAnimal.location,
      notes: savedAnimal.notes,
      predictedBreed: savedAnimal.predicted_breed || savedAnimal.predictedBreed || savedAnimal.breed,
      ageMonths: savedAnimal.age_months || savedAnimal.ageMonths,
      gender: savedAnimal.gender,
      healthStatus: savedAnimal.health_status || savedAnimal.healthStatus || 'healthy',
      vaccinationStatus: savedAnimal.vaccination_status || savedAnimal.vaccinationStatus || 'unknown',
      weight: savedAnimal.weight || null,
      imageUrls: savedAnimal.image_urls || savedAnimal.imageUrls || savedAnimal.images,
      gps: savedAnimal.gps,
      capturedAt: savedAnimal.captured_at || savedAnimal.capturedAt
    });
  } catch (e) {
    console.error('Error creating animal:', e);
    console.error('Error stack:', e.stack);
    
    // Provide more specific error messages
    let errorMessage = 'Failed to create animal record';
    let errorDetails = e.message || 'Unknown error';
    
    // Check for specific error types
    if (e.code === '23505') {
      errorMessage = 'Duplicate record error';
      errorDetails = 'An animal record with this information already exists.';
    } else if (e.code === '23503') {
      errorMessage = 'Foreign key constraint error';
      errorDetails = 'Invalid reference in the record. Please check your data.';
    } else if (e.code === '23502') {
      errorMessage = 'Required field missing';
      errorDetails = 'Some required fields are missing. Please fill all required fields.';
    } else if (e.message && e.message.includes('null value')) {
      errorMessage = 'Missing required field';
      errorDetails = 'Some required fields are missing. Please ensure Owner Name and Location are filled.';
    } else if (e.message && e.message.includes('database')) {
      errorMessage = 'Database connection error';
      errorDetails = 'Unable to connect to the database. Please try again later.';
    } else if (e.details) {
      errorDetails = e.details;
    }
    
    res.status(500).json({ 
      error: errorMessage, 
      details: errorDetails,
      code: e.code || null
    });
  }
});

// Update animal record
app.put('/api/animals/:id', authMiddleware, async (req, res) => {
  try {
    const { ownerName, owner_name, location, notes, predictedBreed, predicted_breed, ageMonths, age_months, gender, status, healthStatus, health_status, vaccinationStatus, vaccination_status, weight, weight_kg } = req.body;
    const animals = await getAnimals();
    const animal = animals.find(a => a.id === req.params.id);
    
    if (!animal) {
      return res.status(404).json({ error: 'Animal record not found' });
    }
    
    // Check permissions - admin can edit all, users can only edit their own records
    const user = req.user;
    const createdBy = animal.created_by || animal.createdBy;
    const isAdmin = user.role === 'admin';
    const isOwner = user.role === 'user' && (createdBy === user.sub || createdBy === null || createdBy === undefined);
    
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ error: 'Permission denied. You can only edit your own records.' });
    }
    
    // Map updates to Supabase format
    const updates = {};
    
    // All users (including regular users) can update owner_name, location, health status, vaccination status, and weight
    if (ownerName !== undefined || owner_name !== undefined) {
      updates.owner_name = ownerName || owner_name;
    }
    if (location !== undefined) {
      updates.location = location;
    }
    if (healthStatus !== undefined || health_status !== undefined) {
      updates.health_status = (healthStatus || health_status || '').trim() || 'healthy';
    }
    if (vaccinationStatus !== undefined || vaccination_status !== undefined) {
      updates.vaccination_status = (vaccinationStatus || vaccination_status || '').trim() || 'unknown';
    }
    if (weight !== undefined || weight_kg !== undefined) {
      const weightValue = (weight || weight_kg || '').toString().trim();
      updates.weight = weightValue ? (isNaN(weightValue) ? null : Number(weightValue)) : null;
    }
    
    // Only admins can update other fields
    if (isAdmin) {
      if (notes !== undefined) updates.notes = notes;
      if (predictedBreed !== undefined || predicted_breed !== undefined) {
        updates.predicted_breed = predictedBreed || predicted_breed;
        updates.breed = predictedBreed || predicted_breed;
      }
      if (ageMonths !== undefined || age_months !== undefined) updates.age_months = Number(ageMonths || age_months);
      if (gender !== undefined) updates.gender = gender;
      if (status !== undefined) updates.status = status;
    }
    
    updates.updated_at = new Date().toISOString();
    updates.updated_by = user.sub;
    
    try {
      const updatedAnimal = await db.updateAnimal(req.params.id, updates);
      await logActivity('animal.update', { id: req.params.id, userId: user.sub });
      broadcastUpdate('animal_updated', updatedAnimal);
      
      // Return in frontend-compatible format
      res.json({
        id: updatedAnimal.id,
        createdAt: updatedAnimal.created_at || updatedAnimal.createdAt,
        createdBy: updatedAnimal.created_by || updatedAnimal.createdBy,
        updatedAt: updatedAnimal.updated_at || updatedAnimal.updatedAt,
        updatedBy: updatedAnimal.updated_by || updatedAnimal.updatedBy,
        status: updatedAnimal.status,
        ownerName: updatedAnimal.owner_name || updatedAnimal.ownerName || '',
        earTag: updatedAnimal.ear_tag || updatedAnimal.earTag || '',
        location: updatedAnimal.location || '',
        notes: updatedAnimal.notes || '',
        predictedBreed: updatedAnimal.predicted_breed || updatedAnimal.predictedBreed || updatedAnimal.breed || '',
        breed: updatedAnimal.breed || updatedAnimal.predicted_breed || updatedAnimal.predictedBreed || '',
        ageMonths: updatedAnimal.age_months || updatedAnimal.ageMonths || null,
        gender: updatedAnimal.gender || '',
        healthStatus: updatedAnimal.health_status || updatedAnimal.healthStatus || 'healthy',
        vaccinationStatus: updatedAnimal.vaccination_status || updatedAnimal.vaccinationStatus || 'unknown',
        weight: updatedAnimal.weight || null,
        imageUrls: updatedAnimal.image_urls || updatedAnimal.imageUrls || updatedAnimal.images || [],
        gps: updatedAnimal.gps || null,
        capturedAt: updatedAnimal.captured_at || updatedAnimal.capturedAt || null
      });
    } catch (e) {
      console.error('❌ Error updating animal in Supabase:', e);
      throw e; // Re-throw to return proper error response
    }
  } catch (error) {
    console.error('Error updating animal:', error);
    res.status(500).json({ error: 'Failed to update animal record' });
  }
});

// Approvals
app.post('/api/animals/:id/approve', authMiddleware, requireRole(['admin']), async (req, res) => {
  try {
    const updates = { 
      status: 'approved', 
      approved_at: new Date().toISOString(), 
      approved_by: req.user.sub,
      updated_at: new Date().toISOString()
    };
    
    try {
      const updatedAnimal = await db.updateAnimal(req.params.id, updates);
      await logActivity('animal.approve', { id: req.params.id, userId: req.user.sub });
      broadcastUpdate('animal_approved', updatedAnimal);
      res.json(updatedAnimal);
    } catch (e) {
      console.error('❌ Error approving animal:', e);
      throw e;
    }
  } catch (e) {
    console.error('Error approving animal:', e);
    res.status(500).json({ error: 'Failed to approve animal' });
  }
});

app.post('/api/animals/:id/reject', authMiddleware, requireRole(['admin']), async (req, res) => {
  try {
    const updates = { 
      status: 'rejected', 
      rejected_at: new Date().toISOString(), 
      rejected_by: req.user.sub, 
      reject_reason: (req.body && req.body.reason) || '',
      updated_at: new Date().toISOString()
    };
    
    try {
      const updatedAnimal = await db.updateAnimal(req.params.id, updates);
      await logActivity('animal.reject', { id: req.params.id, userId: req.user.sub });
      broadcastUpdate('animal_rejected', updatedAnimal);
      res.json(updatedAnimal);
    } catch (e) {
      console.error('❌ Error rejecting animal:', e);
      throw e;
    }
  } catch (e) {
    console.error('Error rejecting animal:', e);
    res.status(500).json({ error: 'Failed to reject animal' });
  }
});

// Delete animal endpoint
app.delete('/api/animals/:id', authMiddleware, async (req, res) => {
  try {
    const animals = await getAnimals();
    const animal = animals.find(a => a.id === req.params.id);
    
    if (!animal) {
      return res.status(404).json({ error: 'Animal record not found' });
    }
    
    await db.deleteAnimal(req.params.id);
    await logActivity('animal.delete', { id: req.params.id, userId: req.user?.sub });
    broadcastUpdate('animal_deleted', { id: req.params.id });
    
    res.json({ 
      success: true, 
      message: 'Animal record deleted successfully',
      deletedId: req.params.id 
    });
  } catch (e) {
    console.error('Error deleting animal:', e);
    res.status(500).json({ error: 'Failed to delete animal record', details: e.message });
  }
});

// Prediction route
// Helper function to get breed information from database
async function getBreedInfo(breedName) {
  try {
    const breeds = await getBreeds();
    // Normalize breed name for matching (remove common suffixes and spaces)
    const normalizedName = breedName.replace(/\s*\(.*?\)\s*/g, '').trim().toLowerCase();
    
    // Try exact match first
    let breedInfo = breeds.find(b => 
      b.name.toLowerCase() === normalizedName || 
      b.name.toLowerCase().replace(/\s+/g, '') === normalizedName.replace(/\s+/g, '')
    );
    
    // Try partial match if exact match fails
    if (!breedInfo) {
      breedInfo = breeds.find(b => 
        b.name.toLowerCase().includes(normalizedName) || 
        normalizedName.includes(b.name.toLowerCase())
      );
    }
    
    if (breedInfo) {
      return {
        name: breedInfo.name,
        origin: breedInfo.origin || breedInfo.origin || '',
        description: breedInfo.description || '',
        avgMilkYield: breedInfo.avg_milk_yield || breedInfo.avgMilkYield || '',
        avgWeight: breedInfo.avg_weight || breedInfo.avgWeight || '',
        traits: breedInfo.characteristics || breedInfo.traits || [],
        species: breedInfo.species || 'cattle'
      };
    }
    
    // Return default values if breed not found
    return {
      name: breedName.replace(/\s*\(.*?\)\s*/g, '').trim(),
      origin: '',
      description: `AI-detected breed: ${breedName.replace(/\s*\(.*?\)\s*/g, '').trim()}`,
      avgMilkYield: '',
      avgWeight: '',
      traits: ['AI-detected'],
      species: 'cattle'
    };
  } catch (error) {
    console.error('Error getting breed info:', error);
    return {
      name: breedName.replace(/\s*\(.*?\)\s*/g, '').trim(),
      origin: '',
      description: `AI-detected breed: ${breedName.replace(/\s*\(.*?\)\s*/g, '').trim()}`,
      avgMilkYield: '',
      avgWeight: '',
      traits: ['AI-detected'],
      species: 'cattle'
    };
  }
}

app.post('/api/predict', authMiddleware, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  
  try {
    // Use PyTorch model as primary for species detection - MUST use actual model
      let speciesResult;
    try {
      speciesResult = await pytorchPredictor.detectSpecies(req.file.buffer);
    } catch (speciesError) {
      console.error('❌ Species detection failed:', speciesError.message);
      const serviceUrl = process.env.PYTORCH_SERVICE_URL || 'http://localhost:5001';
      const isExternalService = serviceUrl && !serviceUrl.startsWith('http://localhost') && !serviceUrl.startsWith('http://127.0.0.1');
      
      // Check if error is about model loading
      const isModelLoading = speciesError.message.includes('still loading') || 
                            speciesError.message.includes('not loaded') ||
                            speciesError.message.includes('Model is');
      
      return res.status(503).json({ 
        error: isModelLoading ? 'Model is loading' : 'AI model species detection unavailable',
        message: isModelLoading 
          ? 'The AI model is currently loading. This happens on the first request and takes 30-90 seconds. Please wait a moment and try again.'
          : 'The PyTorch model prediction service is not available.',
        details: isExternalService 
          ? (isModelLoading 
              ? `Model is loading on Railway service at ${serviceUrl}. First request triggers model download and loading.`
              : `Please ensure your external Python service at ${serviceUrl} is deployed and running. See DEPLOYMENT.md for instructions.`)
          : 'For local development: Start the Python service with: cd backend/models && python pytorch_service.py\nFor production: Deploy the Python service separately and set PYTORCH_SERVICE_URL environment variable.',
        serviceUrl: serviceUrl,
        retryAfter: isModelLoading ? 30 : null, // Suggest retry after 30s if loading
        deploymentGuide: 'See DEPLOYMENT.md for instructions on deploying the Python service'
      });
    }
    
    if (speciesResult.species === 'non_animal') {
      return res.status(400).json({ 
        error: 'Non-animal image detected',
        species: speciesResult.species,
        confidence: speciesResult.confidence
      });
    }
    
    // Use PyTorch model as primary predictor - MUST use actual model, no mocks
    let pytorchPredictions;
    try {
      pytorchPredictions = await pytorchPredictor.predictBreed(req.file.buffer);
    } catch (predictionError) {
      console.error('❌ Model prediction failed:', predictionError.message);
      const serviceUrl = process.env.PYTORCH_SERVICE_URL || 'http://localhost:5001';
      const isExternalService = serviceUrl && !serviceUrl.startsWith('http://localhost') && !serviceUrl.startsWith('http://127.0.0.1');
      
      // Check if error is about model loading
      const isModelLoading = predictionError.message.includes('still loading') || 
                            predictionError.message.includes('not loaded') ||
                            predictionError.message.includes('Model is');
      
      return res.status(503).json({ 
        error: isModelLoading ? 'Model is loading' : 'AI model prediction service unavailable',
        message: isModelLoading 
          ? 'The AI model is currently loading. This happens on the first request and takes 30-90 seconds. Please wait a moment and try again.'
          : 'The PyTorch model prediction service is not available.',
        details: isExternalService 
          ? (isModelLoading 
              ? `Model is loading on Railway service at ${serviceUrl}. First request triggers model download and loading.`
              : `Please ensure your external Python service at ${serviceUrl} is deployed and running. See DEPLOYMENT.md for instructions.`)
          : 'For local development: Start the Python service with: cd backend/models && python pytorch_service.py\nFor production: Deploy the Python service separately (Railway, Render, etc.) and set PYTORCH_SERVICE_URL environment variable.',
        serviceUrl: serviceUrl,
        retryAfter: isModelLoading ? 30 : null, // Suggest retry after 30s if loading
        modelFile: 'best_model_convnext_base_acc0.7007.pth'
      });
    }
    
    // Use PyTorch predictions as primary (combined predictions now just use PyTorch)
    const combinedPredictions = pytorchPredictions;
    const isCrossbreed = await pytorchPredictor.isCrossbreed(combinedPredictions);
    const heatmapData = await pytorchPredictor.generateHeatmap(req.file.buffer, combinedPredictions);
    
    // Extract breed information DIRECTLY from model prediction ONLY
    // No database lookups - only what the model predicts
    let breedInfo = null;
    if (combinedPredictions && combinedPredictions.length > 0) {
      const topPrediction = combinedPredictions[0];
      const breedName = topPrediction.breed.replace(/\s*\(.*?\)\s*/g, '').trim();
      const confidence = topPrediction.confidence;
      
      // Determine species from prediction or breed name
      let finalSpecies = speciesResult.species;
      if (finalSpecies === 'cattle_or_buffalo') {
        // Infer from breed name if possible
        const breedLower = breedName.toLowerCase();
        if (breedLower.includes('buffalo') || 
            ['murrah', 'mehsana', 'surti', 'jaffrabadi', 'nili_ravi', 'bhadawari'].some(b => breedLower.includes(b))) {
          finalSpecies = 'buffalo';
        } else {
          finalSpecies = 'cattle';
        }
      }
      
      // Build breed info from ONLY model prediction data
      breedInfo = {
        name: breedName,
        origin: null, // Model doesn't provide - leave null
        description: `AI-detected breed from model prediction. Species: ${finalSpecies}. Breed confidence: ${(confidence * 100).toFixed(1)}%`,
        avgMilkYield: null, // Model doesn't provide - leave null
        avgWeight: null, // Model doesn't provide - leave null
        traits: [
          `Model Prediction: ${(confidence * 100).toFixed(1)}% confidence`,
          `Species: ${finalSpecies}`,
          `Species Confidence: ${(speciesResult.confidence * 100).toFixed(1)}%`,
          ...(isCrossbreed ? ['Crossbreed detected'] : []),
          'AI-detected from model'
        ],
        species: finalSpecies,
        confidence: confidence,
        isCrossbreed: isCrossbreed || false
      };
    }
    
    res.json({
      species: speciesResult.species,
      speciesConfidence: speciesResult.confidence,
      predictions: combinedPredictions,
      pytorchPredictions: pytorchPredictions,
      isCrossbreed,
      heatmapData: heatmapData,
      breedInfo: breedInfo // Only model prediction data - no database lookups
    });
  } catch (error) {
    console.error('Prediction error:', error);
    res.status(500).json({ error: 'Prediction failed' });
  }
});

// Notifications
app.get('/api/notifications', authMiddleware, (req, res) => {
  const notifications = notificationService.getNotifications(req.user.sub);
  res.json(notifications);
});

app.post('/api/notifications/:id/read', authMiddleware, (req, res) => {
  notificationService.markAsRead(req.params.id);
  res.json({ ok: true });
});


// Analytics endpoint
app.get('/api/logs', authMiddleware, async (req, res) => {
  try {
    const logs = await getLogs();
    res.json(logs);
  } catch (e) {
    console.error('Error fetching logs:', e);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

// Supervisor endpoints
app.get('/api/animals/pending', authMiddleware, requireRole(['admin']), async (req, res) => {
  try {
    const animals = await getAnimals();
    const pendingAnimals = animals.filter(animal => animal.status === 'pending');
    
    // Add additional metadata for supervisors
    const enrichedAnimals = pendingAnimals.map(animal => ({
      ...animal,
      aiConfidence: animal.aiConfidence || 0,
      imageQuality: animal.imageQuality || { blur: false, dark: false, pose: 'good' },
      reviewHistory: animal.reviewHistory || [],
      flags: animal.flags || []
    }));
    
    res.json(enrichedAnimals);
  } catch (e) {
    console.error('Error fetching pending animals:', e);
    res.status(500).json({ error: 'Failed to fetch pending animals' });
  }
});

// Animal approval/rejection endpoints (duplicate - these are handled by the async versions above)

app.post('/api/animals/:id/flag', authMiddleware, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { notes, reviewedBy, flagType } = req.body;
    
    const animal = await db.getAnimals().then(animals => animals.find(a => a.id === id));
    if (!animal) {
      return res.status(404).json({ error: 'Animal not found' });
    }
    
    // Get existing review history
    const reviewHistory = animal.reviewHistory || [];
    reviewHistory.push({
      action: 'flagged',
      reviewedBy,
      notes,
      flagType: flagType || 'general',
      timestamp: new Date().toISOString()
    });
    
    const updates = {
      status: 'needs_revision',
      reviewed_at: new Date().toISOString(),
      reviewed_by: reviewedBy,
      review_notes: notes,
      flag_type: flagType || 'general',
      review_history: reviewHistory,
      updated_at: new Date().toISOString()
    };
    
    const updatedAnimal = await db.updateAnimal(id, updates);
    await logActivity('animal.flagged', { animalId: id, reviewedBy, flagType });
    
    res.json({ success: true, animal: updatedAnimal });
  } catch (e) {
    console.error('Error flagging animal:', e);
    res.status(500).json({ error: 'Failed to flag animal' });
  }
});

// Team analytics endpoint
app.get('/api/analytics/team', authMiddleware, requireRole(['admin']), async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));
    
    const animals = await getAnimals();
    const users = await getUsers();
    const logs = await getLogs();
    
    // Filter animals by date range
    const recentAnimals = animals.filter(animal => 
      new Date(animal.createdAt) >= cutoffDate
    );
    
    // Get regular users
    const regularUsers = users.filter(user => user.role === 'user');
    
    // Calculate team performance
    const teamPerformance = {
      totalRecords: recentAnimals.length,
      avgAccuracy: 0,
      avgDailyWork: 0,
      workers: {}
    };
    
    let totalAccuracy = 0;
    let accuracyCount = 0;
    
    regularUsers.forEach(user => {
      const userAnimals = recentAnimals.filter(animal => animal.createdBy === user.id);
      const approvedAnimals = userAnimals.filter(animal => animal.status === 'approved');
      const accuracy = userAnimals.length > 0 ? approvedAnimals.length / userAnimals.length : 0;
      
      if (userAnimals.length > 0) {
        totalAccuracy += accuracy;
        accuracyCount++;
      }
      
      teamPerformance.workers[user.id] = {
        name: user.name,
        village: user.village,
        totalRecords: userAnimals.length,
        approvedRecords: approvedAnimals.length,
        accuracy: accuracy,
        avgDailyWork: userAnimals.length / parseInt(days),
        performanceScore: Math.round(accuracy * 100),
        lastActive: userAnimals.length > 0 ? 
          userAnimals.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0].createdAt : 
          null
      };
    });
    
    teamPerformance.avgAccuracy = accuracyCount > 0 ? totalAccuracy / accuracyCount : 0;
    teamPerformance.avgDailyWork = recentAnimals.length / parseInt(days);
    
    // Breed distribution
    const breedDistribution = {};
    recentAnimals.forEach(animal => {
      const breed = animal.predictedBreed || 'Unknown';
      breedDistribution[breed] = (breedDistribution[breed] || 0) + 1;
    });
    
    // Location coverage
    const locationCoverage = {};
    recentAnimals.forEach(animal => {
      const location = animal.location || 'Unknown';
      if (!locationCoverage[location]) {
        locationCoverage[location] = { count: 0, workers: new Set() };
      }
      locationCoverage[location].count++;
      if (animal.createdBy) {
        locationCoverage[location].workers.add(animal.createdBy);
      }
    });
    
    // Convert Set to count
    Object.keys(locationCoverage).forEach(location => {
      locationCoverage[location].workers = locationCoverage[location].workers.size;
    });
    
    // Workload distribution
    const workloadDistribution = {
      highPerformers: 0,
      averagePerformers: 0,
      needsTraining: 0,
      inactive: 0
    };
    
    Object.values(teamPerformance.workers).forEach(worker => {
      if (worker.totalRecords === 0) {
        workloadDistribution.inactive++;
      } else if (worker.accuracy >= 0.9) {
        workloadDistribution.highPerformers++;
      } else if (worker.accuracy >= 0.7) {
        workloadDistribution.averagePerformers++;
      } else {
        workloadDistribution.needsTraining++;
      }
    });
    
    // Generate recommendations
    const recommendations = [];
    
    if (workloadDistribution.needsTraining > 0) {
      recommendations.push({
        priority: 'high',
        title: 'Training Required',
        description: `${workloadDistribution.needsTraining} workers need additional training to improve accuracy.`
      });
    }
    
    if (workloadDistribution.inactive > 0) {
      recommendations.push({
        priority: 'medium',
        title: 'Inactive Workers',
        description: `${workloadDistribution.inactive} workers have no recent activity. Consider follow-up.`
      });
    }
    
    if (teamPerformance.avgAccuracy < 0.8) {
      recommendations.push({
        priority: 'high',
        title: 'Low Team Accuracy',
        description: 'Overall team accuracy is below 80%. Consider team-wide training session.'
      });
    }
    
    res.json({
      teamPerformance,
      breedDistribution,
      locationCoverage,
      workloadDistribution,
      recommendations
    });
  } catch (e) {
    console.error('Error generating team analytics:', e);
    res.status(500).json({ error: 'Failed to generate analytics' });
  }
});

// Admin endpoints
app.get('/api/admin/users', authMiddleware, requireRole(['admin']), async (req, res) => {
  try {
    const users = await getUsers();
    
    // Remove sensitive data
    const safeUsers = users.map(user => ({
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      permissions: user.permissions || [],
      isActive: user.is_active !== false && user.isActive !== false,
      createdAt: user.created_at || user.createdAt,
      lastActive: user.lastActive,
      userId: user.id
    }));
    
    // Calculate statistics
    const totalUsers = safeUsers.length;
    const activeUsers = safeUsers.filter(u => u.role === 'user' && u.isActive).length;
    
    res.json({
      users: safeUsers,
      totalUsers,
      activeUsers
    });
  } catch (e) {
    console.error('Error fetching users:', e);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.post('/api/admin/users', authMiddleware, requireRole(['admin']), async (req, res) => {
  try {
    const { 
      name, 
      email, 
      phone,
      password, 
      role,
      permissions
    } = req.body;
    
    if (!name || !email || !password || !role) {
      return res.status(400).json({ error: 'Name, email, password, and role are required' });
    }
    
    // Only allow 'user' or 'admin' roles
    if (role !== 'user' && role !== 'admin') {
      return res.status(400).json({ error: 'Invalid role. Only "user" or "admin" roles are allowed.' });
    }
    
    const users = await getUsers();
    if (users.find(u => u.email === email)) {
      return res.status(400).json({ error: 'Email already exists' });
    }
    
    const user = { 
      id: nanoid(), 
      name, 
      email, 
      phone,
      role, 
      password_hash: bcrypt.hashSync(password, 10),
      created_at: new Date().toISOString(),
      is_active: true,
      permissions: permissions || getRolePermissions(role)
    };
    
    await db.createUser(user);
    
    logActivity('admin.user_created', { userId: user.id, createdBy: req.user?.sub });
    
    res.status(201).json({ success: true, user: { id: user.id, name: user.name, email: user.email, role: user.role } });
  } catch (e) {
    console.error('Error creating user:', e);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.put('/api/admin/users/:id', authMiddleware, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    // Prevent updating password directly (should use separate endpoint)
    delete updates.password;
    delete updates.passwordHash;
    delete updates.password_hash;
    
    // Validate role if being updated
    if (updates.role && updates.role !== 'user' && updates.role !== 'admin') {
      return res.status(400).json({ error: 'Invalid role. Only "user" or "admin" roles are allowed.' });
    }
    
    // Map camelCase to snake_case for Supabase
    const supabaseUpdates = {};
    if (updates.name !== undefined) supabaseUpdates.name = updates.name;
    if (updates.email !== undefined) supabaseUpdates.email = updates.email;
    if (updates.phone !== undefined) supabaseUpdates.phone = updates.phone;
    if (updates.role !== undefined) supabaseUpdates.role = updates.role;
    if (updates.permissions !== undefined) supabaseUpdates.permissions = updates.permissions;
    if (updates.isActive !== undefined) supabaseUpdates.is_active = updates.isActive;
    supabaseUpdates.updated_at = new Date().toISOString();
    
    try {
      const updatedUser = await db.updateUser(id, supabaseUpdates);
      logActivity('admin.user_updated', { userId: id, updatedBy: req.user?.sub });
      res.json({ success: true, user: updatedUser });
    } catch (e) {
      console.error('❌ Error updating user:', e);
      throw e;
    }
  } catch (e) {
    console.error('Error updating user:', e);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.delete('/api/admin/users/:id', authMiddleware, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    
    // Prevent deleting self
    if (id === req.user?.sub) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    
    // First check if user exists
    const users = await getUsers();
    const user = users.find(u => u.id === id);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    try {
      console.log('🗑️  Deleting user via API:', id);
      const result = await db.deleteUser(id);
      console.log('✅ User deletion result:', result);
      
      // Wait a moment for database to commit the deletion
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Verify deletion by checking if user still exists (only from Supabase, not JSON)
      if (process.env.USE_SUPABASE === 'true') {
        const supabaseUsers = await db.getUsers();
        const stillExists = supabaseUsers.some(u => u.id === id);
        
        if (stillExists) {
          console.error('❌ User still exists in Supabase after deletion attempt!');
          return res.status(500).json({ 
            error: 'User deletion failed - user still exists in database',
            details: 'The user may be protected by Row Level Security policies. Please check your Supabase RLS settings.'
          });
        }
      }
      
      await logActivity('admin.user_deleted', { userId: id, deletedBy: req.user?.sub });
      res.json({ success: true, message: 'User deleted successfully', deletedId: id });
    } catch (dbError) {
      console.error('❌ Error deleting user from Supabase:', dbError);
      console.error('Error message:', dbError.message);
      console.error('Error code:', dbError.code);
      
      // Return detailed error to help debug
      return res.status(500).json({ 
        error: 'Failed to delete user from database', 
        details: dbError.message || 'Unknown error',
        code: dbError.code,
        hint: 'If this persists, check Supabase Row Level Security (RLS) policies for the users table'
      });
    }
  } catch (e) {
    console.error('Error deleting user:', e);
    res.status(500).json({ error: 'Failed to delete user', details: e.message });
  }
});

app.put('/api/admin/users/:id/status', authMiddleware, requireRole(['admin']), async (req, res) => {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    
    const updatedUser = await db.updateUser(id, { is_active: isActive, updated_at: new Date().toISOString() });
    await logActivity('admin.user_status_changed', { userId: id, isActive, changedBy: req.user?.sub });
    res.json({ success: true, user: updatedUser });
  } catch (e) {
    console.error('Error updating user status:', e);
    res.status(500).json({ error: 'Failed to update user status' });
  }
});

// Helper function to get default permissions for roles
function getRolePermissions(role) {
  const permissions = {
    // Regular users only get basic permissions for registered users
    user: [
      'create_animal',
      'view_own_animals',
      'update_own_animals'
    ],
    // Admin gets all permissions
    admin: ['all']
  };
  return permissions[role] || [];
}

// Breed management endpoints
app.get('/api/admin/breeds', authMiddleware, requireRole(['admin']), async (req, res) => {
  try {
    const breeds = await getBreeds();
    
    // Map snake_case to camelCase for frontend compatibility
    const mappedBreeds = (breeds || []).map(breed => ({
      id: breed.id,
      name: breed.name,
      origin: breed.origin || null,
      description: breed.description || null,
      avgMilkYield: breed.avg_milk_yield || null,
      avgWeight: breed.avg_weight || null,
      traits: Array.isArray(breed.characteristics) ? breed.characteristics : [],
      characteristics: breed.characteristics || [],
      species: breed.species || null,
      imageUrl: breed.image_url || null,
      image_url: breed.image_url || null,
      notes: breed.notes || null,
      isRareBreed: breed.is_rare_breed !== undefined ? Boolean(breed.is_rare_breed) : false,
      is_rare_breed: breed.is_rare_breed !== undefined ? Boolean(breed.is_rare_breed) : false,
      createdAt: breed.created_at || breed.createdAt,
      updatedAt: breed.updated_at || breed.updatedAt
    }));
    
    // Return breeds from Supabase (or empty array if none exist)
    // Don't auto-seed - let admin add breeds manually
    res.json(mappedBreeds);
  } catch (e) {
    console.error('Error fetching breeds:', e);
    res.status(500).json({ error: 'Failed to fetch breeds', details: e.message });
  }
});

app.post('/api/admin/breeds', authMiddleware, requireRole(['admin']), async (req, res) => {
  try {
    const breedData = req.body;
    
    // Validate required fields
    if (!breedData.name || breedData.name.trim() === '') {
      return res.status(400).json({ error: 'Breed name is required' });
    }
    
    const breeds = await getBreeds();
    
    // Check if breed name already exists
    const existingBreed = breeds.find(b => 
      b.name.toLowerCase().trim() === breedData.name.toLowerCase().trim()
    );
    
    if (existingBreed) {
      return res.status(400).json({ error: 'Breed with this name already exists' });
    }
    
    const breed = {
      id: nanoid(),
      name: breedData.name.trim(),
      origin: breedData.origin || '',
      description: breedData.description || '',
      avg_milk_yield: breedData.avgMilkYield || breedData.avg_milk_yield || null,
      avg_weight: breedData.avgWeight || breedData.avg_weight || null,
      characteristics: Array.isArray(breedData.traits) ? breedData.traits : (Array.isArray(breedData.characteristics) ? breedData.characteristics : []),
      species: breedData.species || 'cattle',
      image_url: breedData.imageUrl || breedData.image_url || null,
      notes: breedData.notes || '', // Admin notes field
      is_rare_breed: breedData.isRareBreed !== undefined ? Boolean(breedData.isRareBreed) : false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    try {
      const savedBreed = await db.createBreed(breed);
      await logActivity('admin.breed_created', { breedId: savedBreed.id, breedName: savedBreed.name, userId: req.user?.sub });
      
      // Map to frontend-compatible format
      const mappedBreed = {
        id: savedBreed.id,
        name: savedBreed.name,
        origin: savedBreed.origin || null,
        description: savedBreed.description || null,
        avgMilkYield: savedBreed.avg_milk_yield || null,
        avgWeight: savedBreed.avg_weight || null,
        traits: Array.isArray(savedBreed.characteristics) ? savedBreed.characteristics : [],
        characteristics: savedBreed.characteristics || [],
        species: savedBreed.species || null,
        imageUrl: savedBreed.image_url || null,
        notes: savedBreed.notes || null,
        isRareBreed: savedBreed.is_rare_breed !== undefined ? Boolean(savedBreed.is_rare_breed) : false,
        createdAt: savedBreed.created_at || savedBreed.createdAt,
        updatedAt: savedBreed.updated_at || savedBreed.updatedAt
      };
      
      res.status(201).json({ success: true, breed: mappedBreed });
    } catch (dbError) {
      console.error('❌ Error creating breed:', dbError);
      throw dbError;
    }
  } catch (e) {
    console.error('Error creating breed:', e);
    res.status(500).json({ error: 'Failed to create breed' });
  }
});

// Update breed endpoint
app.put('/api/admin/breeds/:id', authMiddleware, requireRole(['admin']), async (req, res) => {
  try {
    const breedId = req.params.id;
    const updates = req.body;
    
    const breeds = await getBreeds();
    const breed = breeds.find(b => b.id === breedId);
    
    if (!breed) {
      return res.status(404).json({ error: 'Breed not found' });
    }
    
    // Check if name is being changed and if new name already exists
    if (updates.name && updates.name.trim() !== breed.name) {
      const existingBreed = breeds.find(b => 
        b.id !== breedId && 
        b.name.toLowerCase().trim() === updates.name.toLowerCase().trim()
      );
      
      if (existingBreed) {
        return res.status(400).json({ error: 'Breed with this name already exists' });
      }
    }
    
    // Map updates to Supabase format
    const supabaseUpdates = {
      name: updates.name ? updates.name.trim() : breed.name,
      origin: updates.origin !== undefined ? updates.origin : breed.origin,
      description: updates.description !== undefined ? updates.description : breed.description,
      avg_milk_yield: updates.avgMilkYield !== undefined ? updates.avgMilkYield : (updates.avg_milk_yield !== undefined ? updates.avg_milk_yield : breed.avg_milk_yield),
      avg_weight: updates.avgWeight !== undefined ? updates.avgWeight : (updates.avg_weight !== undefined ? updates.avg_weight : breed.avg_weight),
      characteristics: Array.isArray(updates.traits) ? updates.traits : (Array.isArray(updates.characteristics) ? updates.characteristics : breed.characteristics),
      species: updates.species !== undefined ? updates.species : breed.species,
      image_url: updates.imageUrl !== undefined ? updates.imageUrl : (updates.image_url !== undefined ? updates.image_url : breed.image_url),
      notes: updates.notes !== undefined ? updates.notes : (breed.notes || ''), // Admin notes field
      is_rare_breed: updates.isRareBreed !== undefined ? Boolean(updates.isRareBreed) : (breed.is_rare_breed !== undefined ? breed.is_rare_breed : false),
      updated_at: new Date().toISOString()
    };
    
    try {
      const updatedBreed = await db.updateBreed(breedId, supabaseUpdates);
      await logActivity('admin.breed_updated', { breedId, breedName: updatedBreed.name, userId: req.user?.sub });
      
      // Map to frontend-compatible format
      const mappedBreed = {
        id: updatedBreed.id,
        name: updatedBreed.name,
        origin: updatedBreed.origin || null,
        description: updatedBreed.description || null,
        avgMilkYield: updatedBreed.avg_milk_yield || null,
        avgWeight: updatedBreed.avg_weight || null,
        traits: Array.isArray(updatedBreed.characteristics) ? updatedBreed.characteristics : [],
        characteristics: updatedBreed.characteristics || [],
        species: updatedBreed.species || null,
        imageUrl: updatedBreed.image_url || null,
        notes: updatedBreed.notes || null,
        isRareBreed: updatedBreed.is_rare_breed !== undefined ? Boolean(updatedBreed.is_rare_breed) : false,
        createdAt: updatedBreed.created_at || updatedBreed.createdAt,
        updatedAt: updatedBreed.updated_at || updatedBreed.updatedAt
      };
      
      res.json({ success: true, breed: mappedBreed });
    } catch (dbError) {
      console.error('❌ Error updating breed:', dbError);
      throw dbError;
    }
  } catch (e) {
    console.error('Error updating breed:', e);
    res.status(500).json({ error: 'Failed to update breed' });
  }
});

// Delete breed endpoint
app.delete('/api/admin/breeds/:id', authMiddleware, requireRole(['admin']), async (req, res) => {
  try {
    const breedId = req.params.id;
    
    // First check if breed exists
    const breeds = await getBreeds();
    const breed = breeds.find(b => b.id === breedId);
    
    if (!breed) {
      return res.status(404).json({ error: 'Breed not found' });
    }
    
    try {
      console.log('🗑️  Deleting breed via API:', breedId);
      const result = await db.deleteBreed(breedId);
      console.log('✅ Breed deletion result:', result);
      
      // Wait a moment for database to commit the deletion
      await new Promise(resolve => setTimeout(resolve, 200));
      
      // Verify deletion by checking if breed still exists (only from Supabase, not JSON)
      if (process.env.USE_SUPABASE === 'true') {
        const supabaseBreeds = await db.getBreeds();
        const stillExists = supabaseBreeds.some(b => b.id === breedId);
        
        if (stillExists) {
          console.error('❌ Breed still exists in Supabase after deletion attempt!');
          return res.status(500).json({ 
            error: 'Breed deletion failed - breed still exists in database',
            details: 'The breed may be protected by Row Level Security policies. Please check your Supabase RLS settings.'
          });
        }
      }
      
      await logActivity('admin.breed_deleted', { breedId, breedName: breed.name, userId: req.user?.sub });
      res.json({ success: true, message: 'Breed deleted successfully', deletedId: breedId });
    } catch (dbError) {
      console.error('❌ Error deleting breed from Supabase:', dbError);
      console.error('Error message:', dbError.message);
      console.error('Error code:', dbError.code);
      
      // Return detailed error to help debug
      return res.status(500).json({ 
        error: 'Failed to delete breed from database', 
        details: dbError.message || 'Unknown error',
        code: dbError.code,
        hint: 'If this persists, check Supabase Row Level Security (RLS) policies for the breeds table'
      });
    }
  } catch (e) {
    console.error('Error deleting breed:', e);
    res.status(500).json({ error: 'Failed to delete breed', details: e.message });
  }
});

// Image upload endpoint for breed references
app.post('/api/upload/breed-image', authMiddleware, requireRole(['admin']), upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image uploaded' });
    }
    
    const ext = path.extname(req.file.originalname || '.jpg') || '.jpg';
    const fileName = `breed_${nanoid()}${ext}`;
    const filePath = path.join(IMAGES_DIR, fileName);
    
    fs.writeFileSync(filePath, req.file.buffer);
    
    const imageUrl = `/uploads/${fileName}`;
    res.json({ success: true, imageUrl });
  } catch (e) {
    console.error('Error uploading breed image:', e);
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

// Removed veterinarian and government endpoints - only user and admin roles supported

// Voice Input
app.post('/api/voice/process', authMiddleware, upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio uploaded' });
  
  try {
    const { language = 'en-US' } = req.body;
    const voiceData = await voiceService.processVoiceInput(req.file.buffer, language);
    res.json(voiceData);
  } catch (error) {
    console.error('Voice processing error:', error);
    res.status(500).json({ error: 'Voice processing failed' });
  }
});

app.post('/api/voice/create-animal', authMiddleware, async (req, res) => {
  try {
    const { voiceData } = req.body;
    const animalData = await voiceService.createAnimalFromVoice(voiceData, req.user);
    
    // Prepare animal for Supabase
    const animal = {
      id: animalData.id || nanoid(),
      created_at: new Date().toISOString(),
      created_by: req.user?.sub || null,
      status: 'pending',
      owner_name: animalData.ownerName || '',
      ear_tag: animalData.earTag || '',
      location: animalData.location || '',
      notes: animalData.notes || '',
      predicted_breed: animalData.predictedBreed || '',
      breed: animalData.breed || animalData.predictedBreed || '',
      age_months: animalData.ageMonths || null,
      gender: animalData.gender || '',
      image_urls: animalData.imageUrls || [],
      gps: animalData.gps || null,
      captured_at: animalData.capturedAt || new Date().toISOString()
    };
    
    const savedAnimal = await db.createAnimal(animal);
    
    // Add to blockchain
    blockchainService.createAnimalRecord(savedAnimal, req.user.sub);
    
    // Broadcast real-time update
    broadcastUpdate('animal_created', savedAnimal);
    
    res.status(201).json(savedAnimal);
  } catch (error) {
    console.error('Error creating animal from voice:', error);
    res.status(500).json({ error: 'Failed to create animal from voice' });
  }
});

// Blockchain
app.get('/api/blockchain/stats', authMiddleware, (req, res) => {
  const stats = blockchainService.getBlockchainStats();
  res.json(stats);
});

app.get('/api/blockchain/animal/:id/history', authMiddleware, (req, res) => {
  const history = blockchainService.getAnimalHistory(req.params.id);
  res.json(history);
});

app.get('/api/blockchain/animal/:id/verify', authMiddleware, (req, res) => {
  const verification = blockchainService.verifyAnimalRecord(req.params.id);
  res.json(verification);
});

app.get('/api/blockchain/animal/:id/certificate', authMiddleware, (req, res) => {
  try {
    const certificate = blockchainService.generateCertificate(req.params.id);
    res.json(certificate);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// AR Overlays
app.get('/api/ar/breed/:breed', authMiddleware, (req, res) => {
  const { confidence = 0.8 } = req.query;
  const overlay = arService.generateBreedOverlay(req.params.breed, parseFloat(confidence));
  res.json(overlay);
});

app.post('/api/ar/health', authMiddleware, (req, res) => {
  const { healthData } = req.body;
  const overlay = arService.generateHealthOverlay(healthData);
  res.json(overlay);
});

// Voice Input
app.post('/api/voice/process', authMiddleware, upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio uploaded' });
  
  try {
    const { language = 'en-US' } = req.body;
    const voiceData = await voiceService.processVoiceInput(req.file.buffer, language);
    res.json(voiceData);
  } catch (error) {
    console.error('Voice processing error:', error);
    res.status(500).json({ error: 'Voice processing failed' });
  }
});

app.post('/api/voice/create-animal', authMiddleware, async (req, res) => {
  try {
    const { voiceData } = req.body;
    const animalData = await voiceService.createAnimalFromVoice(voiceData, req.user);
    
    // Prepare animal for Supabase
    const animal = {
      id: animalData.id || nanoid(),
      created_at: new Date().toISOString(),
      created_by: req.user?.sub || null,
      status: 'pending',
      owner_name: animalData.ownerName || '',
      ear_tag: animalData.earTag || '',
      location: animalData.location || '',
      notes: animalData.notes || '',
      predicted_breed: animalData.predictedBreed || '',
      breed: animalData.breed || animalData.predictedBreed || '',
      age_months: animalData.ageMonths || null,
      gender: animalData.gender || '',
      image_urls: animalData.imageUrls || [],
      gps: animalData.gps || null,
      captured_at: animalData.capturedAt || new Date().toISOString()
    };
    
    const savedAnimal = await db.createAnimal(animal);
    
    // Add to blockchain
    blockchainService.createAnimalRecord(savedAnimal, req.user.sub);
    
    // Broadcast real-time update
    broadcastUpdate('animal_created', savedAnimal);
    
    res.status(201).json(savedAnimal);
  } catch (error) {
    console.error('Error creating animal from voice:', error);
    res.status(500).json({ error: 'Failed to create animal from voice' });
  }
});

// Blockchain
app.get('/api/blockchain/stats', authMiddleware, (req, res) => {
  const stats = blockchainService.getBlockchainStats();
  res.json(stats);
});

app.get('/api/blockchain/animal/:id/history', authMiddleware, (req, res) => {
  const history = blockchainService.getAnimalHistory(req.params.id);
  res.json(history);
});

app.get('/api/blockchain/animal/:id/verify', authMiddleware, (req, res) => {
  const verification = blockchainService.verifyAnimalRecord(req.params.id);
  res.json(verification);
});

app.get('/api/blockchain/animal/:id/certificate', authMiddleware, (req, res) => {
  try {
    const certificate = blockchainService.generateCertificate(req.params.id);
    res.json(certificate);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// AR Overlays
app.get('/api/ar/breed/:breed', authMiddleware, (req, res) => {
  const { confidence = 0.8 } = req.query;
  const overlay = arService.generateBreedOverlay(req.params.breed, parseFloat(confidence));
  res.json(overlay);
});

app.post('/api/ar/health', authMiddleware, (req, res) => {
  const { healthData } = req.body;
  const overlay = arService.generateHealthOverlay(healthData);
  res.json(overlay);
});

app.post('/api/ar/vaccination', authMiddleware, (req, res) => {
  const { animal, vaccinationSchedule } = req.body;
  const overlay = arService.generateVaccinationOverlay(animal, vaccinationSchedule);
  res.json(overlay);
});

app.get('/api/ar/training/:type', authMiddleware, (req, res) => {
  const overlay = arService.generateTrainingOverlay(req.params.type);
  res.json(overlay);
});

app.get('/api/ar/breeds', authMiddleware, (req, res) => {
  const breeds = arService.getBreedList();
  res.json(breeds);
});

// Marketplace
app.get('/api/marketplace/listings', authMiddleware, (req, res) => {
  const listings = marketplaceService.getListings(req.query);
  res.json(listings);
});

app.get('/api/marketplace/categories', authMiddleware, (req, res) => {
  const categories = marketplaceService.getCategories();
  res.json(categories);
});

app.get('/api/marketplace/recommendations', authMiddleware, (req, res) => {
  const { animalData, location } = req.query;
  const recommendations = marketplaceService.getRecommendations(
    JSON.parse(animalData || '{}'), 
    location || ''
  );
  res.json(recommendations);
});

app.get('/api/marketplace/listing/:id', authMiddleware, (req, res) => {
  const listing = marketplaceService.getListingById(req.params.id);
  if (!listing) return res.status(404).json({ error: 'Listing not found' });
  res.json(listing);
});

app.post('/api/marketplace/listing', authMiddleware, (req, res) => {
  try {
    const listing = marketplaceService.createListing(req.body, req.user.sub);
    res.status(201).json(listing);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/marketplace/listing/:id', authMiddleware, (req, res) => {
  try {
    const listing = marketplaceService.updateListing(req.params.id, req.body, req.user.sub);
    res.json(listing);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.delete('/api/marketplace/listing/:id', authMiddleware, (req, res) => {
  try {
    marketplaceService.deleteListing(req.params.id, req.user.sub);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/marketplace/inquiry', authMiddleware, (req, res) => {
  try {
    const { listingId, message } = req.body;
    const inquiry = marketplaceService.recordInquiry(listingId, req.user.sub, message);
    res.status(201).json(inquiry);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/marketplace/stats', authMiddleware, (req, res) => {
  const stats = marketplaceService.getMarketplaceStats();
  res.json(stats);
});

// Advanced Notifications
app.post('/api/notifications/send', authMiddleware, async (req, res) => {
  try {
    const { type, animalId, ownerContact } = req.body;
    const animals = getAnimals();
    const animal = animals.find(a => a.id === animalId);
    
    if (!animal) return res.status(404).json({ error: 'Animal not found' });
    
    let result;
    switch (type) {
      case 'vaccination':
        result = await advancedNotificationService.sendVaccinationReminder(animal, ownerContact);
        break;
      case 'health_alert':
        result = await advancedNotificationService.sendHealthAlert(animal, req.body.healthData, ownerContact);
        break;
      case 'approval':
        result = await advancedNotificationService.sendApprovalNotification(animal, ownerContact);
        break;
      default:
        return res.status(400).json({ error: 'Invalid notification type' });
    }
    
    res.json(result);
  } catch (error) {
    console.error('Notification sending error:', error);
    res.status(500).json({ error: 'Failed to send notification' });
  }
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Server error' });
});

// Export for Vercel serverless functions
if (process.env.VERCEL) {
  module.exports = app;
} else {
server.listen(port, () => {
  console.log(`API listening on :${port}`);
  console.log(`WebSocket server ready for real-time updates`);
});
}
