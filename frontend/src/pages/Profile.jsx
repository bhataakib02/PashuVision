import { useEffect, useState } from 'react'
import Header from '../components/Header.jsx'

export default function Profile() {
  const [profile, setProfile] = useState(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [region, setRegion] = useState('')
  const [language, setLanguage] = useState('')
  const [photo, setPhoto] = useState(null)
  const [photoPreview, setPhotoPreview] = useState(null)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      setError('Login required')
      setLoading(false)
      return
    }
    setLoading(true)
    fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(async r => {
        if (!r.ok) throw new Error((await r.json()).error || 'Failed')
        return r.json()
      })
      .then(p => {
        setProfile(p)
        setName(p.name || '')
        setEmail(p.email || '')
        setPhone(p.phone || '')
        setRegion(p.region || '')
        setLanguage(p.language || '')
        setError('')
      })
      .catch(e => {
        setError(e.message || 'Error loading profile')
        console.error('Profile load error:', e)
      })
      .finally(() => setLoading(false))
  }, [])

  const onSave = async () => {
    const token = localStorage.getItem('token')
    if (!token) return setError('Login required')
    setSaving(true)
    setError('')
    setSuccess('')
    try {
      const fd = new FormData()
      fd.append('name', name)
      fd.append('phone', phone)
      fd.append('region', region)
      fd.append('language', language)
      if (photo) fd.append('photo', photo)
      const res = await fetch('/api/me', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      let data = null
      try { data = await res.json() } catch {}
      if (!res.ok) throw new Error((data && data.error) || 'Save failed')
      // Update profile with response data
      setProfile(data)
      // Clear photo state after successful save
      setPhoto(null)
      setPhotoPreview(null)
      // Update localStorage with new profile data
      localStorage.setItem('user', JSON.stringify({ ...(JSON.parse(localStorage.getItem('user')||'{}')), name: data.name, photoUrl: data.photoUrl }))
      setSuccess('✅ Profile updated successfully!')
      
      // Reload profile to ensure photo is displayed (in case of caching issues)
      setTimeout(async () => {
        const token = localStorage.getItem('token')
        if (token) {
          try {
            const res = await fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } })
            if (res.ok) {
              const updatedProfile = await res.json()
              setProfile(updatedProfile)
            }
          } catch (e) {
            console.error('Error reloading profile:', e)
          }
        }
      }, 500)
      
      // Clear success message after 3 seconds
      setTimeout(() => setSuccess(''), 3000)
    } catch (e) {
      setError(e.message || 'Failed to update profile')
      setSuccess('')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <>
        <Header />
        <div className="container" style={{ padding: isMobile ? '60px 12px 20px' : '80px 20px 20px' }}>
          <div className="card" style={{ padding: isMobile ? '16px' : '24px', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', marginBottom: '12px' }}>⏳</div>
            <div style={{ fontSize: isMobile ? '16px' : '14px', color: '#666' }}>Loading profile...</div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Header />
      <div className="container" style={{ padding: isMobile ? '60px 12px 20px' : '80px 20px 20px' }}>
        <div className="card" style={{ padding: isMobile ? '16px' : '24px' }}>
          <h1 style={{ fontSize: isMobile ? '24px' : '28px', marginBottom: '20px' }}>My Profile</h1>
          {error && <div style={{ color: 'salmon', padding: '12px', marginBottom: '12px', backgroundColor: '#ffe6e6', borderRadius: '6px', border: '1px solid #ff9999', fontSize: isMobile ? '14px' : '13px' }}>{error}</div>}
          {success && <div style={{ color: '#4CAF50', padding: '12px', marginBottom: '12px', backgroundColor: '#e8f5e9', borderRadius: '6px', border: '1px solid #81c784', fontSize: isMobile ? '14px' : '13px' }}>{success}</div>}
          <div className="grid" style={{ 
            gridTemplateColumns: isMobile ? '1fr' : '220px 1fr',
            gap: isMobile ? '24px' : '32px',
            alignItems: isMobile ? 'center' : 'flex-start'
          }}>
            <div className="stack" style={{ alignItems: 'center', width: '100%' }}>
              {/* Show preview if photo is selected, otherwise show saved photo or placeholder */}
              {photoPreview ? (
                <img 
                  src={photoPreview} 
                  alt="avatar preview" 
                  style={{ 
                    width: isMobile ? 150 : 200, 
                    height: isMobile ? 150 : 200, 
                    borderRadius: 12, 
                    objectFit: 'cover', 
                    border: '2px solid #ddd',
                    margin: '0 auto',
                    display: 'block'
                  }} 
                />
              ) : profile?.photoUrl ? (
                <img 
                  src={`${profile.photoUrl}?t=${Date.now()}`} 
                  alt="avatar" 
                  onError={(e) => {
                    e.target.style.display = 'none'
                    const placeholder = e.target.nextElementSibling
                    if (placeholder) placeholder.style.display = 'flex'
                  }}
                  style={{ 
                    width: isMobile ? 150 : 200, 
                    height: isMobile ? 150 : 200, 
                    borderRadius: 12, 
                    objectFit: 'cover', 
                    border: '2px solid #ddd',
                    margin: '0 auto',
                    display: 'block'
                  }} 
                />
              ) : null}
              <div style={{ 
                width: isMobile ? 150 : 200, 
                height: isMobile ? 150 : 200, 
                borderRadius: 12, 
                background: '#e0e0e0', 
                display: (photoPreview || profile?.photoUrl) ? 'none' : 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                fontSize: isMobile ? '64px' : '48px', 
                color: '#999',
                margin: '0 auto'
              }}>
                👤
              </div>
              <label style={{ marginTop: '10px', fontSize: isMobile ? '16px' : '14px', fontWeight: '500', textAlign: 'center', width: '100%' }}>Profile Photo</label>
              <input 
                className="file" 
                type="file" 
                accept="image/*" 
                onChange={e => {
                  const file = e.target.files?.[0] || null
                  setPhoto(file)
                  if (file) {
                    // Create preview URL
                    const reader = new FileReader()
                    reader.onloadend = () => {
                      setPhotoPreview(reader.result)
                    }
                    reader.readAsDataURL(file)
                  } else {
                    setPhotoPreview(null)
                  }
                }}
                style={{ 
                  fontSize: isMobile ? '16px' : '14px',
                  padding: isMobile ? '12px' : '8px',
                  width: '100%',
                  maxWidth: isMobile ? '100%' : '220px'
                }}
              />
              {photo && <small style={{ color: '#666', fontSize: isMobile ? '14px' : '12px', marginTop: '5px', textAlign: 'center', wordBreak: 'break-word' }}>Selected: {photo.name}</small>}
            </div>
            <div className="stack" style={{ width: '100%', gap: isMobile ? '16px' : '12px' }}>
              <div className="stack">
                <label style={{ fontSize: isMobile ? '16px' : '14px', fontWeight: '500' }}>Name *</label>
                <input 
                  className="input" 
                  value={name} 
                  onChange={e => setName(e.target.value)} 
                  placeholder="Your full name"
                  style={{ 
                    fontSize: isMobile ? '16px' : '14px',
                    padding: isMobile ? '14px' : '10px',
                    width: '100%'
                  }}
                />
              </div>
              <div className="stack">
                <label style={{ fontSize: isMobile ? '16px' : '14px', fontWeight: '500' }}>Email *</label>
                <input 
                  className="input" 
                  type="email" 
                  value={email} 
                  onChange={e => setEmail(e.target.value)} 
                  placeholder="your.email@example.com" 
                  disabled
                  style={{ 
                    fontSize: isMobile ? '16px' : '14px',
                    padding: isMobile ? '14px' : '10px',
                    width: '100%'
                  }}
                />
                <small style={{ color: '#666', fontSize: isMobile ? '14px' : '12px', wordBreak: 'break-word' }}>Email cannot be changed</small>
              </div>
              <div className="stack">
                <label style={{ fontSize: isMobile ? '16px' : '14px', fontWeight: '500' }}>Phone</label>
                <input 
                  className="input" 
                  type="tel" 
                  value={phone} 
                  onChange={e => setPhone(e.target.value)} 
                  placeholder="+91 98765 43210"
                  style={{ 
                    fontSize: isMobile ? '16px' : '14px',
                    padding: isMobile ? '14px' : '10px',
                    width: '100%'
                  }}
                />
              </div>
              <div className="stack">
                <label style={{ fontSize: isMobile ? '16px' : '14px', fontWeight: '500' }}>Region</label>
                <input 
                  className="input" 
                  value={region} 
                  onChange={e => setRegion(e.target.value)} 
                  placeholder="Your region or location"
                  style={{ 
                    fontSize: isMobile ? '16px' : '14px',
                    padding: isMobile ? '14px' : '10px',
                    width: '100%'
                  }}
                />
              </div>
              <div className="stack">
                <label style={{ fontSize: isMobile ? '16px' : '14px', fontWeight: '500' }}>Language</label>
                <input 
                  className="input" 
                  value={language} 
                  onChange={e => setLanguage(e.target.value)} 
                  placeholder="en"
                  style={{ 
                    fontSize: isMobile ? '16px' : '14px',
                    padding: isMobile ? '14px' : '10px',
                    width: '100%'
                  }}
                />
              </div>
              <div style={{ marginTop: isMobile ? '8px' : '4px' }}>
                <button 
                  className="btn" 
                  disabled={saving} 
                  onClick={onSave}
                  style={{
                    fontSize: isMobile ? '16px' : '14px',
                    padding: isMobile ? '14px 24px' : '10px 20px',
                    minHeight: isMobile ? '48px' : '40px',
                    width: isMobile ? '100%' : 'auto'
                  }}
                >
                  {saving ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}


