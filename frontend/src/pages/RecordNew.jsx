import { useState } from 'react'
import Layout from '../components/Layout.jsx'
import ErrorBanner from '../components/ErrorBanner.jsx'
import SuccessBanner from '../components/SuccessBanner.jsx'

export default function RecordNew() {
  const [files, setFiles] = useState([])
  const [previews, setPreviews] = useState([])
  const [form, setForm] = useState({ 
    ownerName: '', 
    location: '', 
    notes: '', 
    ageMonths: '', 
    ageYears: '',
    ageMonthsOnly: '',
    gender: '',
    earTag: '',
    weight: '',
    healthStatus: 'healthy',
    vaccinationStatus: 'unknown',
    predictedBreed: '',
    breedConfidence: 0
  })
  const [gps, setGps] = useState({ lat: '', lng: '', accuracy: 0 })
  const [capturedAt, setCapturedAt] = useState('')
  const [pred, setPred] = useState(null)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [locationError, setLocationError] = useState('')
  const [saving, setSaving] = useState(false)
  const [predicting, setPredicting] = useState(false)
  const [imageQuality, setImageQuality] = useState({ blur: false, dark: false, pose: 'good' })
  const [cameraMode, setCameraMode] = useState(false)
  const [voiceInput, setVoiceInput] = useState(false)
  const [isOffline, setIsOffline] = useState(!navigator.onLine)

  // Helper function to format age display
  const formatAgeDisplay = (ageMonths) => {
    if (!ageMonths || ageMonths === '') return ''
    const months = parseInt(ageMonths)
    const years = Math.floor(months / 12)
    const remainingMonths = months % 12
    if (years === 0) return `${remainingMonths} months`
    if (remainingMonths === 0) return `${years} years`
    return `${years} years ${remainingMonths} months`
  }

  // Helper function to convert years and months to total months
  const convertToMonths = (years, months) => {
    const yearsNum = parseInt(years) || 0
    const monthsNum = parseInt(months) || 0
    return (yearsNum * 12) + monthsNum
  }

  // Helper function to parse age input (supports both formats)
  const parseAgeInput = (input) => {
    if (!input) return { years: '', months: '', totalMonths: '' }
    
    // Check if input contains "yr" or "year" (format: "15yr 5 months" or "15 years 5 months")
    const yearMonthMatch = input.match(/(\d+)\s*(?:yr|year)s?\s*(\d+)\s*months?/i)
    if (yearMonthMatch) {
      const years = yearMonthMatch[1]
      const months = yearMonthMatch[2]
      const totalMonths = convertToMonths(years, months)
      return { years, months, totalMonths: totalMonths.toString() }
    }
    
    // Check if input is just months (format: "128")
    const monthsMatch = input.match(/^(\d+)$/)
    if (monthsMatch) {
      const totalMonths = parseInt(monthsMatch[1])
      const years = Math.floor(totalMonths / 12)
      const months = totalMonths % 12
      return { years: years.toString(), months: months.toString(), totalMonths: totalMonths.toString() }
    }
    
    return { years: '', months: '', totalMonths: '' }
  }

  const onFiles = (e) => {
    const list = Array.from(e.target.files || [])
    setPred(null)
    setError('')
    
    // Validate image quality
    const validatedFiles = []
    const validatedPreviews = []
    
    list.forEach(file => {
      const img = new Image()
      img.onload = () => {
        // Check for blur (simplified - check image dimensions vs file size)
        const isBlurry = file.size < 50000 && (img.width < 800 || img.height < 600)
        
        // Check for darkness (simplified - check if image is mostly dark)
        const canvas = document.createElement('canvas')
        const ctx = canvas.getContext('2d')
        canvas.width = img.width
        canvas.height = img.height
        ctx.drawImage(img, 0, 0)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const data = imageData.data
        let totalBrightness = 0
        
        for (let i = 0; i < data.length; i += 4) {
          const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3
          totalBrightness += brightness
        }
        
        const avgBrightness = totalBrightness / (data.length / 4)
        const isDark = avgBrightness < 80
        
        setImageQuality({ blur: isBlurry, dark: isDark, pose: 'good' })
        
        if (isBlurry || isDark) {
          setError(`⚠️ Image quality issues detected: ${isBlurry ? 'Blurry' : ''} ${isDark ? 'Too dark' : ''}. Consider retaking.`)
        }
      }
      
      validatedFiles.push(file)
      validatedPreviews.push(URL.createObjectURL(file))
    })
    
    setFiles(validatedFiles)
    setPreviews(validatedPreviews)
  }

  const captureFromCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        } 
      })
      
      const video = document.createElement('video')
      video.srcObject = stream
      video.play()
      
      // Create camera interface
      const cameraContainer = document.createElement('div')
      cameraContainer.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%; 
        background: black; z-index: 1000; display: flex; flex-direction: column;
        align-items: center; justify-content: center;
      `
      
      const captureButton = document.createElement('button')
      captureButton.textContent = '📷 Capture'
      captureButton.style.cssText = `
        position: absolute; bottom: 50px; background: #4CAF50; color: white;
        border: none; padding: 15px 30px; border-radius: 25px; font-size: 18px;
        cursor: pointer;
      `
      
      const closeButton = document.createElement('button')
      closeButton.textContent = '✕ Close'
      closeButton.style.cssText = `
        position: absolute; top: 20px; right: 20px; background: #F44336; color: white;
        border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer;
      `
      
      cameraContainer.appendChild(video)
      cameraContainer.appendChild(captureButton)
      cameraContainer.appendChild(closeButton)
      document.body.appendChild(cameraContainer)
      
      captureButton.onclick = () => {
        const canvas = document.createElement('canvas')
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d')
        ctx.drawImage(video, 0, 0)
        
        canvas.toBlob(blob => {
          const file = new File([blob], `camera_${Date.now()}.jpg`, { type: 'image/jpeg' })
          onFiles({ target: { files: [file] } })
        }, 'image/jpeg', 0.9)
        
        stream.getTracks().forEach(track => track.stop())
        document.body.removeChild(cameraContainer)
      }
      
      closeButton.onclick = () => {
        stream.getTracks().forEach(track => track.stop())
        document.body.removeChild(cameraContainer)
      }
      
    } catch (err) {
      setError('Camera access denied or not available')
    }
  }

  const startVoiceInput = () => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
      const recognition = new SpeechRecognition()
      
      recognition.continuous = false
      recognition.interimResults = false
      recognition.lang = 'en-US'
      
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript
        setForm(prev => ({ ...prev, notes: prev.notes + ' ' + transcript }))
      }
      
      recognition.onerror = (event) => {
        setError('Voice recognition failed: ' + event.error)
      }
      
      recognition.start()
      setVoiceInput(true)
      
      recognition.onend = () => {
        setVoiceInput(false)
      }
    } else {
      setError('Voice recognition not supported in this browser')
    }
  }

  const getGps = () => {
    setLocationError('')
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser')
      return
    }
    
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ 
          lat: pos.coords.latitude, 
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        })
        setCapturedAt(new Date().toISOString())
        setLocationError('') // Clear any previous error
      },
      (err) => {
        let errorMsg = 'Failed to get location'
        if (err.code === err.PERMISSION_DENIED) {
          errorMsg = 'Location access denied. Please enable location permissions.'
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          errorMsg = 'Location information unavailable. Please check your GPS settings.'
        } else if (err.code === err.TIMEOUT) {
          errorMsg = 'Location request timed out. Please try again.'
        }
        setLocationError(errorMsg)
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    )
  }

  const predict = async () => {
    if (!files.length) return setError('Select image first')
    setError('')
    setSuccess('')
    setPred(null)
    setPredicting(true)
    
    try {
      const token = localStorage.getItem('token')
      if (!token) {
        setError('Login required. Please log in to use AI prediction.')
        return
      }
      
      const fd = new FormData()
      fd.append('image', files[0])
      
      // Add image quality info for better prediction
      fd.append('imageQuality', JSON.stringify(imageQuality))
      
      const res = await fetch('/api/predict', { 
        method: 'POST', 
        body: fd,
        headers: {
          'Authorization': `Bearer ${token}`
        }
      })
      
      let data
      if (!res.ok) {
        // Try to extract detailed error message from backend
        let errorData = {}
        const contentType = res.headers.get('content-type')
        
        if (contentType && contentType.includes('application/json')) {
          try {
            errorData = await res.json()
          } catch (parseError) {
            console.error('Failed to parse error response:', parseError)
          }
        }
        
        // Build comprehensive error message
        const errorMessage = errorData.message || errorData.error || 'Prediction failed'
        let fullErrorMessage = errorMessage
        
        // Add details if available
        if (errorData.details) {
          fullErrorMessage += `. ${errorData.details}`
        }
        
        // Add retry information for 503 errors
        if (res.status === 503) {
          if (errorData.retryAfter) {
            fullErrorMessage += ` Please wait ${errorData.retryAfter} seconds and try again.`
          } else if (errorMessage.includes('loading')) {
            fullErrorMessage += ' The AI model is loading. Please wait 30-90 seconds and try again.'
          } else {
            fullErrorMessage += ' The AI model service may be unavailable. Please check if the service is running.'
          }
        }
        
        // Add status code if not already included
        if (!errorMessage.includes(`(${res.status})`)) {
          fullErrorMessage = `Prediction failed (${res.status}): ${fullErrorMessage}`
        }
        
        throw new Error(fullErrorMessage)
      } else {
        data = await res.json()
      }
      
      setPred(data)
      
      // Auto-fill breed information
      if (data.predictions?.[0]?.breed) {
        const topPrediction = data.predictions[0]
        const confidence = topPrediction.confidence || 0
        setForm(prev => ({ 
          ...prev, 
          predictedBreed: topPrediction.breed || '',
          breedConfidence: confidence
        }))
        
        // Show success message in green banner
        setSuccess(`Breed identified: ${topPrediction.breed || 'Unknown'} (${(confidence * 100).toFixed(1)}% confidence)`)
        
        // Auto-dismiss success message after 5 seconds
        setTimeout(() => setSuccess(''), 5000)
      }
      
    } catch (err) {
      console.error('Prediction error:', err)
      // Display the actual error message from the backend (includes details about model service)
      // Handle newlines in error messages (from deployment instructions)
      let errorMsg = err.message || 'Failed to predict breed. Please ensure the AI model service is running.'
      
      // Handle network errors
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        errorMsg = 'Network error: Unable to connect to the prediction service. Please check your internet connection.'
      }
      
      // Clean up error message for display
      errorMsg = errorMsg.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
      setError(errorMsg)
      setSuccess('')
    } finally {
      setPredicting(false)
    }
  }


  const save = async () => {
    const token = localStorage.getItem('token')
    if (!token) return setError('Login required')
    if (!files.length) return setError('Image required')
    
    // Validate required fields
    if (!form.ownerName || !form.ownerName.trim()) {
      setError('Owner Name is required')
      return
    }
    if (!form.location || !form.location.trim()) {
      setError('Location is required')
      return
    }
    
    setSaving(true)
    setError('')
    setSuccess('')
    
    try {
      const fd = new FormData()
      files.forEach(f => fd.append('images', f))
      
      // Enhanced form data - ensure all fields have values
      fd.append('ownerName', form.ownerName || '')
      fd.append('location', form.location || '')
      fd.append('notes', form.notes || '')
      
      // Calculate age in months if years/months provided
      let ageMonthsValue = form.ageMonths
      if (!ageMonthsValue && (form.ageYears || form.ageMonthsOnly)) {
        ageMonthsValue = convertToMonths(form.ageYears, form.ageMonthsOnly)
      }
      if (ageMonthsValue) {
        fd.append('ageMonths', ageMonthsValue.toString())
      }
      
      fd.append('gender', form.gender || '')
      fd.append('earTag', form.earTag || '')
      fd.append('weight', form.weight || '')
      fd.append('healthStatus', form.healthStatus || 'healthy')
      fd.append('vaccinationStatus', form.vaccinationStatus || 'unknown')
      
      // Breed data - send full prediction data if available
      if (form.predictedBreed) {
        fd.append('predictedBreed', form.predictedBreed)
        if (form.breedConfidence) {
          fd.append('breedConfidence', form.breedConfidence)
        }
      }
      
      // Send full prediction data if available (for auto-creating breeds)
      if (pred && pred.predictions) {
        fd.append('predictionData', JSON.stringify(pred))
        // Also send species data if available
        if (pred.species) {
          fd.append('species', pred.species)
        }
        if (pred.speciesConfidence) {
          fd.append('speciesConfidence', String(pred.speciesConfidence))
        }
      }
      
      // Location data
      if (gps.lat && gps.lng) { 
        fd.append('gpsLat', String(gps.lat))
        fd.append('gpsLng', String(gps.lng))
        fd.append('gpsAccuracy', String(gps.accuracy))
      }
      if (capturedAt) fd.append('capturedAt', capturedAt)
      
      // Image quality data
      fd.append('imageQuality', JSON.stringify(imageQuality))
      
      // Offline handling
      if (isOffline) {
        // Store in local storage for later sync
        const offlineRecord = {
          id: 'offline_' + Date.now(),
          form,
          files: Array.from(files).map(f => ({ name: f.name, size: f.size, type: f.type })),
          pred,
          gps,
          capturedAt,
          imageQuality,
          timestamp: new Date().toISOString()
        }
        
        const offlineRecords = JSON.parse(localStorage.getItem('offlineRecords') || '[]')
        offlineRecords.push(offlineRecord)
        localStorage.setItem('offlineRecords', JSON.stringify(offlineRecords))
        
        alert('Record saved offline. Will sync when online.')
        resetForm()
        return
      }
      
      const res = await fetch('/api/animals', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      
      if (!res.ok) {
        let errorData;
        try {
          errorData = await res.json();
        } catch (e) {
          errorData = { error: `Save failed (${res.status})` };
        }
        
        // Build comprehensive error message
        let errorMsg = errorData.error || 'Save failed';
        if (errorData.details) {
          errorMsg += `: ${errorData.details}`;
        }
        
        // If token error, redirect to login
        if (res.status === 401 && (errorMsg.includes('token') || errorMsg.includes('Token'))) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          alert('Session expired. Please login again.');
          window.location.href = '/login';
          return;
        }
        
        throw new Error(errorMsg);
      }
      
      resetForm()
      setSuccess('Record saved successfully! Breed information has been added to the main database.')
      setError('')
      // Auto-dismiss success message after 5 seconds
      setTimeout(() => setSuccess(''), 5000)
      
    } catch (e) {
      const errorMsg = e.message || 'Save failed'
      setError(errorMsg)
      // Don't use alert - error banner will show the message
      console.error('Save error:', e)
      
      // Log detailed error for debugging
      if (e.stack) {
        console.error('Error stack:', e.stack)
      }
    } finally {
      setSaving(false)
    }
  }

  const resetForm = () => {
    setFiles([])
    setPreviews([])
    setPred(null)
    setForm({ 
      ownerName: '', 
      location: '', 
      notes: '', 
      ageMonths: '', 
      ageYears: '',
      ageMonthsOnly: '',
      gender: '',
      earTag: '',
      weight: '',
      healthStatus: 'healthy',
      vaccinationStatus: 'unknown',
      predictedBreed: '',
      breedConfidence: 0
    })
    setGps({ lat: '', lng: '', accuracy: 0 })
    setCapturedAt('')
    setImageQuality({ blur: false, dark: false, pose: 'good' })
  }

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }))

  return (
    <Layout>
      {/* Fixed banners below header - only show one at a time */}
      {error && <ErrorBanner error={error} onDismiss={() => setError('')} />}
      {!error && success && <SuccessBanner message={success} onDismiss={() => setSuccess('')} />}
      
      <div className={`container ${error || success ? 'container-with-banner' : ''}`}>
        
        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h1>📷 Capture New Animal</h1>
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <div style={{ 
                padding: '4px 8px', 
                borderRadius: '4px', 
                backgroundColor: isOffline ? '#F44336' : '#4CAF50',
                color: 'white',
                fontSize: '12px'
              }}>
                {isOffline ? '🔴 Offline Mode' : '🟢 Online'}
              </div>
            </div>
          </div>

          {/* Image Capture Section */}
          <div className="card" style={{ marginTop: 16 }}>
            <h3>Image Capture</h3>
            <div className="row" style={{ gap: 12, marginBottom: 16 }}>
              <input className="file" type="file" accept="image/*" multiple onChange={onFiles} />
              <button className="btn secondary" onClick={captureFromCamera}>
                Camera
              </button>
            </div>
            
              {!!previews.length && (
              <div className="grid preview-grid">
                  {previews.map((src, i) => (
                  <div key={i} style={{ position: 'relative' }}>
                    <img 
                      src={src} 
                      alt={`preview ${i}`} 
                      style={{ 
                        width: '100%', 
                        borderRadius: 8, 
                        height: 150, 
                        objectFit: 'cover',
                        border: imageQuality.blur || imageQuality.dark ? '3px solid #F44336' : '3px solid #4CAF50'
                      }} 
                    />
                    {(imageQuality.blur || imageQuality.dark) && (
                      <div style={{
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        background: '#F44336',
                        color: 'white',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '10px'
                      }}>
                        ⚠️ Quality Issue
                      </div>
                    )}
                  </div>
                  ))}
                </div>
              )}
            
            <div className="row" style={{ gap: 8, marginTop: 16 }}>
              <button className="btn" onClick={predict} disabled={!files.length || predicting}>
                {predicting ? 'Analyzing...' : 'AI Breed Prediction'}
              </button>
            </div>
            
            {predicting && (
              <div className="card" style={{ marginTop: 16, backgroundColor: '#e3f2fd', textAlign: 'center' }}>
                <div style={{ fontSize: '48px', marginBottom: 16 }}>AI</div>
                <h4>AI Analyzing Image...</h4>
                <p style={{ color: 'var(--color-text-muted)', marginBottom: 16 }}>
                  Please wait while our AI analyzes the animal image
                </p>
                <div style={{
                  width: '100%',
                  height: '4px',
                  backgroundColor: '#e0e0e0',
                  borderRadius: '2px',
                  overflow: 'hidden',
                  marginTop: 12
                }}>
                  <div style={{
                    width: '100%',
                    height: '100%',
                    backgroundColor: '#2196F3',
                    animation: 'pulse 1.5s ease-in-out infinite'
                  }}></div>
                </div>
              </div>
            )}
            
              {pred && (
              <div className="card" style={{ marginTop: 16, backgroundColor: '#f8f9fa', border: '2px solid #4CAF50' }}>
                <h4 style={{ 
                  color: '#2e7d32', 
                  fontFamily: 'Times New Roman, serif',
                  textAlign: 'center',
                  marginBottom: 'var(--spacing-md)'
                }}>
                  🎯 AI Analysis Results
                </h4>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
                  {pred.predictions?.map((p, i) => (
                    <div key={i} className="card" style={{ 
                      backgroundColor: i === 0 ? '#e8f5e8' : '#f0f0f0',
                      border: i === 0 ? '2px solid #4CAF50' : '1px solid #ddd',
                      textAlign: 'center',
                      padding: 'var(--spacing-md)'
                    }}>
                      <div style={{ 
                        fontWeight: 'bold', 
                        color: i === 0 ? '#2e7d32' : '#666',
                        fontSize: '1.1rem',
                        fontFamily: 'Times New Roman, serif',
                        marginBottom: 'var(--spacing-xs)'
                      }}>
                        #{i + 1} {p.breed || 'Unknown'}
                      </div>
                      <div style={{ 
                        fontSize: '28px', 
                        fontWeight: 'bold', 
                        color: i === 0 ? '#4CAF50' : '#666',
                        marginBottom: 'var(--spacing-xs)'
                      }}>
                        {((p.confidence || 0) * 100).toFixed(1)}%
                      </div>
                      <div style={{ 
                        width: '100%', 
                        height: '8px', 
                        backgroundColor: '#e0e0e0', 
                        borderRadius: '4px',
                        marginTop: 'var(--spacing-xs)'
                      }}>
                        <div style={{
                          width: `${Math.min(100, Math.max(0, (p.confidence || 0) * 100))}%`,
                          height: '100%',
                          backgroundColor: i === 0 ? '#4CAF50' : '#FF9800',
                          borderRadius: '4px',
                          transition: 'width 0.3s ease'
                        }}></div>
                      </div>
                    </div>
                  ))}
                </div>
                
                {pred.isCrossbreed && (
                  <div style={{ 
                    marginTop: 12, 
                    padding: 12, 
                    backgroundColor: '#fff3cd', 
                    border: '1px solid #ffeaa7',
                    borderRadius: 8,
                    color: '#856404',
                    textAlign: 'center'
                  }}>
                    ⚠️ <strong>Crossbreed Detected:</strong> This animal appears to be a mix of breeds
                  </div>
                )}
                
                {pred.species && (
                  <div style={{ 
                    marginTop: 12, 
                    textAlign: 'center',
                    fontSize: '1rem',
                    color: '#666'
                  }}>
                    <strong>Species:</strong> {pred.species} ({pred.speciesConfidence ? (pred.speciesConfidence * 100).toFixed(1) : '0.0'}% confidence)
                    </div>
                  )}
                
                <div style={{
                  marginTop: 'var(--spacing-md)',
                  textAlign: 'center',
                  fontSize: '0.9rem',
                  color: '#4CAF50',
                  fontWeight: '600'
                }}>
                  ✅ Breed information has been automatically filled in the form below
                </div>
              </div>
            )}
          </div>

          {/* Location Section */}
          <div className="card" style={{ marginTop: 16 }}>
            <h3>📍 Location & GPS</h3>
            {locationError && (
              <div style={{ 
                padding: '8px 12px', 
                marginBottom: '12px', 
                background: '#ffebee', 
                color: '#c62828', 
                borderRadius: '4px',
                fontSize: '14px'
              }}>
                ⚠️ {locationError}
              </div>
            )}
            <div className="row" style={{ gap: 8, alignItems: 'center' }}>
              <button className="btn secondary" onClick={getGps}>
                📍 Get GPS Location
              </button>
              <span style={{ color: 'var(--color-muted)' }}>
                {gps.lat && gps.lng ? 
                  `${gps.lat.toFixed(6)}, ${gps.lng.toFixed(6)} (±${Math.round(gps.accuracy)}m)` : 
                  'No location captured'
                }
              </span>
            </div>
          </div>

          {/* Animal Details Form */}
          <div className="card" style={{ marginTop: 16 }}>
            <h3>Animal Details</h3>
            
            {/* AI Predicted Breed Display */}
            {form.predictedBreed && (
              <div style={{
                background: 'linear-gradient(135deg, #e8f5e8, #f0f8ff)',
                border: '2px solid #4CAF50',
                borderRadius: 'var(--radius-md)',
                padding: 'var(--spacing-md)',
                marginBottom: 'var(--spacing-md)',
                textAlign: 'center'
              }}>
                <div style={{
                  fontSize: '1.2rem',
                  fontWeight: 'bold',
                  color: '#2e7d32',
                  fontFamily: 'Times New Roman, serif',
                  marginBottom: 'var(--spacing-xs)'
                }}>
                  🎯 AI Identified Breed
                </div>
                <div style={{
                  fontSize: '1.5rem',
                  fontWeight: 'bold',
                  color: '#1b5e20',
                  fontFamily: 'Times New Roman, serif',
                  marginBottom: 'var(--spacing-xs)'
                }}>
                  {form.predictedBreed}
                </div>
                <div style={{
                  fontSize: '1rem',
                  color: '#4caf50',
                  fontWeight: '600'
                }}>
                  Confidence: {((form.breedConfidence || 0) * 100).toFixed(1)}%
                </div>
                <div style={{
                  width: '100%',
                  height: '6px',
                  backgroundColor: '#e0e0e0',
                  borderRadius: '3px',
                  marginTop: 'var(--spacing-xs)',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${Math.min(100, Math.max(0, (form.breedConfidence || 0) * 100))}%`,
                    height: '100%',
                    backgroundColor: '#4CAF50',
                    borderRadius: '3px',
                    transition: 'width 0.3s ease'
                  }}></div>
                </div>
              </div>
            )}
            
            <div className="grid responsive-grid">
            <div className="stack">
                <label>Owner Name *</label>
                <input className="input" value={form.ownerName} onChange={e => set('ownerName', e.target.value)} placeholder="Farmer's name" required />
              </div>
              <div className="stack">
                <label>Ear Tag / ID</label>
                <input className="input" value={form.earTag} onChange={e => set('earTag', e.target.value)} placeholder="Unique identifier" />
              </div>
              <div className="stack">
                <label>Location *</label>
                <input className="input" value={form.location} onChange={e => set('location', e.target.value)} placeholder="Village, District" required />
              </div>
              <div className="stack">
                <label>Age</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input 
                    className="input" 
                    type="number" 
                    value={form.ageYears} 
                    onChange={e => {
                      const years = e.target.value
                      const months = form.ageMonthsOnly || '0'
                      const totalMonths = convertToMonths(years, months)
                      setForm(prev => ({ 
                        ...prev, 
                        ageYears: years,
                        ageMonths: totalMonths.toString()
                      }))
                    }} 
                    placeholder="Years" 
                    style={{ flex: 1 }}
                  />
                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 'bold' }}>yr</span>
                  <input 
                    className="input" 
                    type="number" 
                    value={form.ageMonthsOnly} 
                    onChange={e => {
                      const months = e.target.value
                      const years = form.ageYears || '0'
                      const totalMonths = convertToMonths(years, months)
                      setForm(prev => ({ 
                        ...prev, 
                        ageMonthsOnly: months,
                        ageMonths: totalMonths.toString()
                      }))
                    }} 
                    placeholder="Months" 
                    style={{ flex: 1 }}
                    min="0"
                    max="11"
                  />
                  <span style={{ color: 'var(--color-text-muted)', fontWeight: 'bold' }}>months</span>
                </div>
                <div style={{
                  fontSize: '0.8rem',
                  color: 'var(--color-text-muted)',
                  marginTop: '4px',
                  fontStyle: 'italic'
                }}>
                  Examples: 2yr 6months, 0yr 8months, 5yr 0months
                </div>
                {(form.ageYears || form.ageMonthsOnly) && (
                  <div style={{
                    fontSize: '0.9rem',
                    color: 'var(--color-primary-green)',
                    fontWeight: '600',
                    marginTop: '4px',
                    padding: '4px 8px',
                    backgroundColor: 'rgba(76, 175, 80, 0.1)',
                    borderRadius: '4px',
                    border: '1px solid rgba(76, 175, 80, 0.3)'
                  }}>
                    📅 {formatAgeDisplay(form.ageMonths)}
                  </div>
                )}
              </div>
              <div className="stack">
                <label>Gender</label>
                <select className="select" value={form.gender} onChange={e => set('gender', e.target.value)}>
                  <option value="">Select Gender</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                </select>
              </div>
              <div className="stack">
                <label>Weight (kg)</label>
                <input className="input" type="number" value={form.weight} onChange={e => set('weight', e.target.value)} placeholder="Weight in kg" />
              </div>
              <div className="stack">
                <label>Health Status</label>
                <select className="select" value={form.healthStatus} onChange={e => set('healthStatus', e.target.value)}>
                  <option value="healthy">Healthy</option>
                  <option value="sick">Sick</option>
                  <option value="injured">Injured</option>
                  <option value="pregnant">Pregnant</option>
                </select>
              </div>
              <div className="stack">
                <label>Vaccination Status</label>
                <select className="select" value={form.vaccinationStatus} onChange={e => set('vaccinationStatus', e.target.value)}>
                  <option value="unknown">Unknown</option>
                  <option value="up_to_date">Up to Date</option>
                  <option value="due">Due</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>
            </div>
            
            <div className="stack" style={{ marginTop: 16 }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <label>Notes & Observations</label>
                <button 
                  className="btn secondary" 
                  onClick={startVoiceInput}
                  disabled={voiceInput}
                  style={{ fontSize: '12px', padding: '4px 8px' }}
                >
                  {voiceInput ? '🎤 Listening...' : '🎤 Voice Input'}
                </button>
              </div>
              <textarea 
                className="textarea" 
                value={form.notes} 
                onChange={e => set('notes', e.target.value)} 
                placeholder="Additional notes, observations, or health concerns..."
                rows={4}
              />
            </div>
          </div>

          {/* Save Section */}
          <div className="card" style={{ marginTop: 16 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <button className="btn" disabled={saving || !files.length} onClick={save}>
                  {saving ? '💾 Saving...' : '💾 Save Animal Record'}
                </button>
              </div>
              <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
                {isOffline ? 'Will sync when online' : 'Saving to server'}
              </div>
            </div>
            {error && <div style={{ color: 'salmon', marginTop: 12 }}>{error}</div>}
          </div>
        </div>
      </div>
    </Layout>
  )
}


