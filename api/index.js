// Vercel serverless function entry point
// This file handles all API routes for Vercel deployment

// Set Vercel environment flag BEFORE requiring server
process.env.VERCEL = 'true';

// Debug: Log environment variable availability (safely, without exposing values)
console.log('🔍 Checking environment variables:');
console.log('  SUPABASE_URL:', process.env.SUPABASE_URL ? '✓ Set' : '✗ Missing');
console.log('  SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? '✓ Set' : '✗ Missing');
console.log('  SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✓ Set' : '✗ Missing');
console.log('  JWT_SECRET:', process.env.JWT_SECRET ? '✓ Set' : '✗ Missing');
console.log('  USE_SUPABASE:', process.env.USE_SUPABASE || 'not set');

// Load environment variables from backend/.env (optional, Vercel uses env vars directly)
const path = require('path');
try {
  require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });
  console.log('ℹ️  Attempted to load .env file (Vercel uses environment variables directly)');
} catch (e) {
  // dotenv might not be available, that's okay - Vercel uses environment variables
  console.log('ℹ️  Using Vercel environment variables (dotenv not available or file not found)');
}

// Change working directory to backend for relative path resolution
const backendPath = path.join(__dirname, '../backend');
const originalCwd = process.cwd();
process.chdir(backendPath);

// Now require the server.js which will export the Express app when VERCEL is set
let app;
try {
  console.log('📦 Loading server.js...');
  app = require('../backend/src/server.js');
  console.log('✅ Server loaded successfully');
} catch (error) {
  console.error('❌ Error loading server:', error);
  console.error('❌ Error stack:', error.stack);
  // Restore original directory
  process.chdir(originalCwd);
  
  // Return a simple error handler if server fails to load
  const express = require('express');
  const errorApp = express();
  errorApp.use(express.json());
  errorApp.all('*', (req, res) => {
    console.error('Server initialization failed:', error.message);
    res.status(500).json({ 
      error: 'Server initialization failed', 
      message: error.message,
      details: 'Check Vercel logs for more information'
    });
  });
  // Export error app instead of throwing
  module.exports = errorApp;
  return;
}

// Restore original directory
process.chdir(originalCwd);

// Export for Vercel - function configuration should be set in vercel.json or project settings
module.exports = app;
