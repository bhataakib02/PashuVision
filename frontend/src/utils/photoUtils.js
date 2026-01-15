/**
 * PERMANENT FIX: Photo utility functions
 * Ensures all photos are displayed correctly, filtering out invalid file paths
 * that don't work on Vercel serverless environment
 */

/**
 * Checks if a photo URL is valid (base64 or external URL, not file path)
 * @param {string} photoUrl - The photo URL to check
 * @returns {boolean} - True if valid, false if invalid file path
 */
export function isValidPhotoUrl(photoUrl) {
  if (!photoUrl) return false;
  
  // Base64 data URLs are always valid
  if (photoUrl.startsWith('data:')) return true;
  
  // External URLs (http/https) are valid
  if (photoUrl.startsWith('http://') || photoUrl.startsWith('https://')) return true;
  
  // File paths (/uploads/...) don't work on Vercel - invalid
  if (photoUrl.startsWith('/uploads/')) return false;
  
  // Other paths might be valid (relative paths, etc.)
  return true;
}

/**
 * Gets the best photo source from profile data
 * Prioritizes base64, then valid photoUrl, returns null if invalid
 * @param {Object} profile - Profile object with photoUrl and photoBase64
 * @returns {string|null} - Valid photo source or null
 */
export function getPhotoSource(profile) {
  if (!profile) return null;
  
  // Priority 1: photoBase64 (always valid)
  if (profile.photoBase64) {
    return profile.photoBase64;
  }
  
  // Priority 2: photoUrl if it's base64
  if (profile.photoUrl && profile.photoUrl.startsWith('data:')) {
    return profile.photoUrl;
  }
  
  // Priority 3: photoUrl if it's valid (not a file path)
  if (profile.photoUrl && isValidPhotoUrl(profile.photoUrl)) {
    // For file paths, try to construct full URL (might work locally)
    if (profile.photoUrl.startsWith('/uploads/')) {
      return `${window.location.origin}${profile.photoUrl}?t=${Date.now()}`;
    }
    return profile.photoUrl;
  }
  
  // Invalid photo - return null
  return null;
}

/**
 * Cleans invalid photo URLs from localStorage
 * Removes file-based photo URLs that don't work on Vercel
 */
export function cleanInvalidPhotosFromStorage() {
  try {
    const userStr = localStorage.getItem('user');
    if (!userStr) return;
    
    const user = JSON.parse(userStr);
    let updated = false;
    
    // Check and clean photoUrl
    if (user.photoUrl && !isValidPhotoUrl(user.photoUrl) && !user.photoUrl.startsWith('data:')) {
      console.warn('🧹 Cleaning invalid photoUrl from localStorage:', user.photoUrl);
      delete user.photoUrl;
      updated = true;
    }
    
    // Ensure photoBase64 is preserved
    if (user.photoBase64 && user.photoBase64.startsWith('data:')) {
      // Keep it
    } else if (user.photoBase64) {
      // Invalid base64, remove it
      delete user.photoBase64;
      updated = true;
    }
    
    if (updated) {
      localStorage.setItem('user', JSON.stringify(user));
      console.log('✅ Cleaned invalid photos from localStorage');
    }
  } catch (error) {
    console.error('❌ Error cleaning localStorage:', error);
  }
}

/**
 * Validates and cleans profile photo data
 * @param {Object} profile - Profile object
 * @returns {Object} - Cleaned profile object
 */
export function validateProfilePhoto(profile) {
  if (!profile) return profile;
  
  const photoSource = getPhotoSource(profile);
  
  // If we have an invalid file path, remove it
  if (profile.photoUrl && !isValidPhotoUrl(profile.photoUrl) && !profile.photoUrl.startsWith('data:')) {
    console.warn('⚠️ Invalid photo URL detected, removing:', profile.photoUrl);
    profile.photoUrl = null;
  }
  
  // Ensure photoBase64 is set if we have a valid base64 source
  if (photoSource && photoSource.startsWith('data:')) {
    profile.photoBase64 = photoSource;
    profile.photoUrl = photoSource; // Also set photoUrl for compatibility
  }
  
  return profile;
}

