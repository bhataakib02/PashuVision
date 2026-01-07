// Vercel serverless function entry point
// This file handles all API routes for Vercel deployment

// Set Vercel environment flag BEFORE requiring server
process.env.VERCEL = 'true';

// Load environment variables from backend/.env
const path = require('path');

// Try to load dotenv if available
try {
  require('dotenv').config({ path: path.join(__dirname, '../backend/.env') });
} catch (e) {
  // dotenv might not be available, that's okay - Vercel uses environment variables
  console.log('ℹ️  Using Vercel environment variables');
}

// Change working directory to backend for relative path resolution
const backendPath = path.join(__dirname, '../backend');
const originalCwd = process.cwd();
process.chdir(backendPath);

// Now require the server.js which will export the Express app when VERCEL is set
let app;
try {
  app = require('../backend/src/server.js');
} catch (error) {
  console.error('❌ Error loading server:', error);
  // Restore original directory
  process.chdir(originalCwd);
  throw error;
}

// Restore original directory
process.chdir(originalCwd);

// Export for Vercel - function configuration should be set in vercel.json or project settings
module.exports = app;
