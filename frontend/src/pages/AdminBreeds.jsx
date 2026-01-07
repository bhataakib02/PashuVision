import { useState, useEffect } from 'react'
import Layout from '../components/Layout.jsx'

export default function AdminBreeds() {
  const [breeds, setBreeds] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddBreed, setShowAddBreed] = useState(false)
  const [editingBreed, setEditingBreed] = useState(null)
  const [predicting, setPredicting] = useState(false)
  const [predictionImage, setPredictionImage] = useState(null)
  const [newBreed, setNewBreed] = useState({
    name: '',
    origin: '',
    species: 'cattle',
    description: '',
    avgMilkYield: '',
    avgWeight: '',
    traits: [],
    isRareBreed: false,
    referenceImages: [],
    notes: ''
  })

  useEffect(() => {
    loadBreeds()
  }, [])

  const loadBreeds = async () => {
    const token = localStorage.getItem('token')
    if (!token) return setError('Login required')
    
    setLoading(true)
    setError('')
    
    try {
      const res = await fetch('/api/admin/breeds', {
        headers: { Authorization: `Bearer ${token}` }
      })
      
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || `Failed to load breeds (${res.status})`)
      }
      
      const data = await res.json()
      // Handle both array and object with breeds property
      const breedsList = Array.isArray(data) ? data : (data.breeds || [])
      setBreeds(breedsList)
    } catch (err) {
      setError(err.message || 'Failed to load breeds')
      setBreeds([]) // Set empty array on error, don't use mock data
      console.error('Error loading breeds:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleAddBreed = async (e) => {
    e.preventDefault()
    const token = localStorage.getItem('token')
    if (!token) return setError('Login required')
    
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/breeds', {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newBreed)
      })
      
      const data = await res.json().catch(() => ({}))
      
      if (!res.ok) {
        const errorMsg = data.error || `Failed to add breed (${res.status})`
        throw new Error(errorMsg)
      }
      
      // Reload breeds list to get updated count
      await loadBreeds()
      setShowAddBreed(false)
      setNewBreed({
        name: '',
        origin: '',
        species: 'cattle',
        description: '',
        avgMilkYield: '',
        avgWeight: '',
        traits: [],
        isRareBreed: false,
        referenceImages: [],
        notes: ''
      })
      
      alert('✅ Breed added successfully')
    } catch (err) {
      const errorMsg = err.message || 'Failed to add breed'
      setError(errorMsg)
      alert(`❌ ${errorMsg}`)
      console.error('Add breed error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateBreed = async (breedId, updates) => {
    const token = localStorage.getItem('token')
    if (!token) {
      setError('Login required')
      alert('❌ Login required')
      return
    }
    
    setLoading(true)
    setError('')
    
    try {
      // Remove viewMode and other frontend-only fields before sending
      const { viewMode, ...breedUpdates } = updates
      
      const res = await fetch(`/api/admin/breeds/${breedId}`, {
        method: 'PUT',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(breedUpdates)
      })
      
      const data = await res.json().catch(() => ({}))
      
      if (!res.ok) {
        const errorMsg = data.error || `Failed to update breed (${res.status})`
        throw new Error(errorMsg)
      }
      
      // Reload breeds list to get updated count and data
      await loadBreeds()
      setEditingBreed(null)
      alert('✅ Breed updated successfully')
    } catch (err) {
      const errorMsg = err.message || 'Failed to update breed'
      setError(errorMsg)
      alert(`❌ ${errorMsg}`)
      console.error('Update breed error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteBreed = async (breedId) => {
    if (!confirm('Are you sure you want to delete this breed?')) return
    
    const token = localStorage.getItem('token')
    if (!token) {
      setError('Login required')
      alert('❌ Login required')
      return
    }
    
    setLoading(true)
    setError('')
    
    try {
      const res = await fetch(`/api/admin/breeds/${breedId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      
      const data = await res.json().catch(() => ({}))
      
      if (!res.ok) {
        const errorMsg = data.error || `Failed to delete breed (${res.status})`
        throw new Error(errorMsg)
      }
      
      // Immediately remove from local state for instant UI update
      setBreeds(prevBreeds => prevBreeds.filter(b => b.id !== breedId))
      
      // Then reload from server to ensure consistency
      await loadBreeds()
      alert('✅ Breed deleted successfully')
    } catch (err) {
      const errorMsg = err.message || 'Failed to delete breed'
      setError(errorMsg)
      alert(`❌ ${errorMsg}`)
      console.error('Delete breed error:', err)
    } finally {
      setLoading(false)
    }
  }


  const handlePredictBreed = async (file) => {
    if (!file) return
    
    setPredicting(true)
    setError('')
    
    try {
      const formData = new FormData()
      formData.append('image', file)
      
      const res = await fetch('/api/predict', {
        method: 'POST',
        body: formData
      })
      
      const data = await res.json().catch(() => ({}))
      
      if (!res.ok) {
        throw new Error(data.error || 'Prediction failed')
        }
        
      // Auto-fill breed name from prediction
      if (data.predictions?.[0]?.breed) {
        const topPrediction = data.predictions[0]
          setNewBreed(prev => ({
            ...prev,
          name: prev.name || topPrediction.breed || ''
        }))
      }
    } catch (err) {
      console.error('Prediction error:', err)
      // Don't set error for prediction failures, just log it
    } finally {
      setPredicting(false)
    }
  }

  const handleImageUpload = async (e, breedData, setBreedData) => {
    const files = Array.from(e.target.files)
    if (files.length === 0) return

    const token = localStorage.getItem('token')
    if (!token) return setError('Login required')

    try {
      const uploadPromises = files.map(async (file) => {
        const formData = new FormData()
        formData.append('image', file)
        
        const res = await fetch('/api/upload/breed-image', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        })
        
        if (!res.ok) throw new Error('Failed to upload image')
        
        const data = await res.json()
        return data.imageUrl
      })

      const imageUrls = await Promise.all(uploadPromises)
      setBreedData(prev => ({
        ...prev,
        referenceImages: [...(prev.referenceImages || []), ...imageUrls]
      }))
    } catch (err) {
      setError(err.message || 'Failed to upload images')
    }
  }

  return (
    <Layout>
      <div className="container">
        {/* Error/Success Display */}
        {error && (
          <div className="card" style={{ 
            marginBottom: 16, 
            backgroundColor: error.startsWith('✅') ? '#e8f5e9' : '#ffebee', 
            border: error.startsWith('✅') ? '2px solid #4CAF50' : '2px solid #f44336',
            color: error.startsWith('✅') ? '#2e7d32' : '#c62828'
          }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>{error.startsWith('✅') ? '✅ Success:' : '❌ Error:'}</strong> {error.replace(/^✅\s*/, '')}
              </div>
              <button 
                className="btn secondary" 
                onClick={() => setError('')}
                style={{ fontSize: '12px', padding: '4px 8px' }}
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {loading && (
          <div className="card" style={{ textAlign: 'center', padding: '40px' }}>
            <div>⏳ Loading breeds...</div>
          </div>
        )}

        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h1>🐄 Breed Data</h1>
            <div className="row" style={{ gap: 8 }}>
              <button 
                className="btn" 
                onClick={() => setShowAddBreed(true)}
              >
                Add Breed
              </button>
            </div>
          </div>

          {/* Breeds List */}
          <div className="card" style={{ marginTop: 16 }}>
            <h3>Registered Breeds ({breeds.length})</h3>

            {breeds.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-muted)' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>B</div>
                <h3>No breeds registered</h3>
                <p>Add your first breed to get started.</p>
              </div>
            ) : (
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '16px' }}>
                {breeds.map(breed => (
                  <div key={breed.id} className="card" style={{ border: '1px solid #e0e0e0' }}>

                    {/* Breed Info */}
                    <div className="stack" style={{ gap: '8px' }}>
                      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                        <h4 style={{ margin: 0 }}>{breed.name}</h4>
                        {breed.isRareBreed && (
                          <span style={{
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: '#FF9800',
                            color: 'white',
                            fontSize: '10px',
                            fontWeight: 'bold'
                          }}>
                            RARE
                          </span>
                        )}
                      </div>
                      
                      <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>
                        <strong>Origin:</strong> {breed.origin || 'Unknown'}
                      </div>
                      
                      {breed.description && (
                        <div style={{ fontSize: '12px' }}>
                          {breed.description.length > 100 ? 
                            `${breed.description.substring(0, 100)}...` : 
                            breed.description
                          }
                        </div>
                      )}

                      {breed.avgWeight && (
                        <div style={{ fontSize: '12px' }}>
                          <strong>Weight:</strong> {breed.avgWeight}kg
                        </div>
                      )}

                      {/* Action Buttons */}
                      <div className="row" style={{ gap: '8px', marginTop: '12px' }}>
                        <button
                          className="btn secondary"
                          style={{ flex: 1, fontSize: '12px', padding: '6px 12px' }}
                          onClick={(e) => {
                            e.stopPropagation()
                            // View mode - read-only
                            const breedData = { 
                              ...breed, 
                              traits: Array.isArray(breed.traits) ? breed.traits : (breed.characteristics || []),
                              viewMode: true 
                            }
                            setEditingBreed(breedData)
                          }}
                        >
                          👁️ View
                        </button>
                        <button
                          className="btn"
                          style={{ flex: 1, fontSize: '12px', padding: '6px 12px' }}
                          onClick={(e) => {
                            e.stopPropagation()
                            // Edit mode
                            const breedData = { 
                              ...breed, 
                              traits: Array.isArray(breed.traits) ? breed.traits : (breed.characteristics || []),
                              viewMode: false 
                            }
                            setEditingBreed(breedData)
                          }}
                        >
                          ✏️ Edit
                        </button>
                        <button
                          className="btn error"
                          style={{ flex: 1, fontSize: '12px', padding: '6px 12px' }}
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteBreed(breed.id)
                          }}
                        >
                          🗑️ Delete
                        </button>
                      </div>

                      {breed.traits?.length > 0 && (
                        <div style={{ fontSize: '12px', marginTop: '8px' }}>
                          <strong>Traits:</strong> {breed.traits.join(', ')}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Breed Statistics */}
          <div className="card" style={{ marginTop: 16 }}>
            <h3>Breed Statistics</h3>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
              <div className="card" style={{ textAlign: 'center' }}>
                <h4>Total Breeds</h4>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#2196F3' }}>
                  {breeds.length}
                </div>
              </div>
              <div className="card" style={{ textAlign: 'center' }}>
                <h4>Rare Breeds</h4>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#FF9800' }}>
                  {breeds.filter(b => b.isRareBreed).length}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Add Breed Modal */}
        {showAddBreed && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0,0,0,0.8)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto'
            }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2>Add New Breed</h2>
                <button 
                  className="btn secondary" 
                  onClick={() => setShowAddBreed(false)}
                >
                  Close
                </button>
              </div>

              <form onSubmit={handleAddBreed} className="stack" style={{ gap: '16px' }}>
                {/* AI Prediction Section */}
                <div className="stack" style={{ 
                  padding: '16px', 
                  backgroundColor: '#f0f8ff', 
                  borderRadius: '8px',
                  border: '2px solid #4CAF50'
                }}>
                  <label style={{ fontWeight: 'bold', color: '#2e7d32' }}>🤖 AI Breed Prediction</label>
                  <div className="row" style={{ gap: '8px', alignItems: 'center' }}>
                    <input 
                      type="file" 
                      accept="image/*" 
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) {
                          setPredictionImage(file)
                          handlePredictBreed(file)
                        }
                      }}
                      style={{ flex: 1 }}
                    />
                    {predicting && <span style={{ color: '#666' }}>Predicting...</span>}
                  </div>
                  <small style={{ color: '#666' }}>Upload an image to auto-fill breed information using AI</small>
                </div>

                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="stack">
                    <label>Breed Name *</label>
                    <input 
                      className="input" 
                      value={newBreed.name} 
                      onChange={e => setNewBreed(prev => ({ ...prev, name: e.target.value }))}
                      required 
                    />
                  </div>
                  <div className="stack">
                    <label>Origin</label>
                    <input 
                      className="input" 
                      value={newBreed.origin} 
                      onChange={e => setNewBreed(prev => ({ ...prev, origin: e.target.value }))}
                    />
                  </div>
                  <div className="stack">
                    <label>Species *</label>
                    <select 
                      className="input" 
                      value={newBreed.species || 'cattle'} 
                      onChange={e => setNewBreed(prev => ({ ...prev, species: e.target.value }))}
                    >
                      <option value="cattle">Cattle</option>
                      <option value="buffalo">Buffalo</option>
                      <option value="cattle_or_buffalo">Cattle or Buffalo</option>
                    </select>
                  </div>
                </div>

                <div className="stack">
                  <label>Description</label>
                  <textarea 
                    className="textarea" 
                    value={newBreed.description} 
                    onChange={e => setNewBreed(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                  />
                </div>

                <div className="stack">
                  <label>Avg Weight (kg)</label>
                  <input 
                    className="input" 
                    type="number" 
                    value={newBreed.avgWeight} 
                    onChange={e => setNewBreed(prev => ({ ...prev, avgWeight: e.target.value }))}
                  />
                </div>

                <div className="stack">
                  <label>Traits (comma-separated)</label>
                  <input 
                    className="input" 
                    value={newBreed.traits.join(', ')} 
                    onChange={e => setNewBreed(prev => ({ 
                      ...prev, 
                      traits: e.target.value.split(',').map(t => t.trim()).filter(t => t) 
                    }))}
                    placeholder="e.g., High milk yield, Disease resistant, Heat tolerant"
                  />
                </div>


                <div className="stack">
                  <label>
                    <input 
                      type="checkbox" 
                      checked={newBreed.isRareBreed}
                      onChange={e => setNewBreed(prev => ({ ...prev, isRareBreed: e.target.checked }))}
                    />
                    Mark as rare breed
                  </label>
                </div>

                <div className="stack">
                  <label>Additional Notes (Admin Only)</label>
                  <textarea 
                    className="textarea" 
                    value={newBreed.notes || ''} 
                    onChange={e => setNewBreed(prev => ({ ...prev, notes: e.target.value }))}
                    rows={3}
                    placeholder="Add any additional notes, observations, or special information about this breed..."
                  />
                </div>

                <div className="row" style={{ gap: '12px' }}>
                  <button 
                    className="btn" 
                    type="submit"
                    disabled={loading}
                  >
                    {loading ? 'Adding...' : 'Add Breed'}
                  </button>
                  <button 
                    className="btn secondary" 
                    type="button"
                    onClick={() => setShowAddBreed(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Edit Breed Modal - Similar structure to Add Modal */}
        {editingBreed && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0,0,0,0.8)',
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
          }}>
            <div style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '600px',
              width: '100%',
              maxHeight: '90vh',
              overflow: 'auto'
            }}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2>{editingBreed.viewMode ? 'View Breed' : 'Edit Breed'}</h2>
                <button 
                  className="btn secondary" 
                  onClick={() => setEditingBreed(null)}
                >
                  Close
                </button>
              </div>

              <div className="stack" style={{ gap: '16px' }}>

                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="stack">
                    <label>Breed Name</label>
                    <input 
                      className="input" 
                      value={editingBreed.name} 
                      onChange={e => setEditingBreed(prev => ({ ...prev, name: e.target.value }))}
                      disabled={editingBreed.viewMode}
                      readOnly={editingBreed.viewMode}
                      style={editingBreed.viewMode ? { backgroundColor: '#f5f5f5', cursor: 'not-allowed' } : {}}
                    />
                  </div>
                  <div className="stack">
                    <label>Origin</label>
                    <input 
                      className="input" 
                      value={editingBreed.origin || ''} 
                      onChange={e => setEditingBreed(prev => ({ ...prev, origin: e.target.value }))}
                      disabled={editingBreed.viewMode}
                      readOnly={editingBreed.viewMode}
                      style={editingBreed.viewMode ? { backgroundColor: '#f5f5f5', cursor: 'not-allowed' } : {}}
                    />
                  </div>
                  <div className="stack">
                    <label>Species *</label>
                    <select 
                      className="input" 
                      value={editingBreed.species || 'cattle'} 
                      onChange={e => setEditingBreed(prev => ({ ...prev, species: e.target.value }))}
                      disabled={editingBreed.viewMode}
                      style={editingBreed.viewMode ? { backgroundColor: '#f5f5f5', cursor: 'not-allowed' } : {}}
                    >
                      <option value="cattle">Cattle</option>
                      <option value="buffalo">Buffalo</option>
                      <option value="cattle_or_buffalo">Cattle or Buffalo</option>
                    </select>
                  </div>
                </div>

                <div className="stack">
                  <label>Description</label>
                  <textarea 
                    className="textarea" 
                    value={editingBreed.description || ''} 
                    onChange={e => setEditingBreed(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    disabled={editingBreed.viewMode}
                    readOnly={editingBreed.viewMode}
                    style={editingBreed.viewMode ? { backgroundColor: '#f5f5f5', cursor: 'not-allowed' } : {}}
                  />
                </div>

                <div className="stack">
                  <label>Avg Weight (kg)</label>
                  <input 
                    className="input" 
                    type="number" 
                    value={editingBreed.avgWeight || ''} 
                    onChange={e => setEditingBreed(prev => ({ ...prev, avgWeight: e.target.value }))}
                    disabled={editingBreed.viewMode}
                    readOnly={editingBreed.viewMode}
                    style={editingBreed.viewMode ? { backgroundColor: '#f5f5f5', cursor: 'not-allowed' } : {}}
                  />
                </div>

                <div className="stack">
                  <label>Traits (comma-separated)</label>
                  <input 
                    className="input" 
                    value={(editingBreed.traits || []).join(', ')} 
                    onChange={e => setEditingBreed(prev => ({ 
                      ...prev, 
                      traits: e.target.value.split(',').map(t => t.trim()).filter(t => t) 
                    }))}
                    disabled={editingBreed.viewMode}
                    readOnly={editingBreed.viewMode}
                    style={editingBreed.viewMode ? { backgroundColor: '#f5f5f5', cursor: 'not-allowed' } : {}}
                  />
                </div>

                <div className="stack">
                  <label>
                    <input 
                      type="checkbox" 
                      checked={editingBreed.isRareBreed || false}
                      onChange={e => setEditingBreed(prev => ({ ...prev, isRareBreed: e.target.checked }))}
                      disabled={editingBreed.viewMode}
                    />
                    Mark as rare breed
                  </label>
                </div>

                <div className="stack">
                  <label>Additional Notes (Admin Only)</label>
                  <textarea 
                    className="textarea" 
                    value={editingBreed.notes || ''} 
                    onChange={e => setEditingBreed(prev => ({ ...prev, notes: e.target.value }))}
                    rows={3}
                    placeholder="Add any additional notes, observations, or special information about this breed..."
                    disabled={editingBreed.viewMode}
                    readOnly={editingBreed.viewMode}
                    style={editingBreed.viewMode ? { backgroundColor: '#f5f5f5', cursor: 'not-allowed' } : {}}
                  />
                </div>

                {editingBreed.viewMode === true ? (
                  <div className="row" style={{ gap: '12px', justifyContent: 'flex-end' }}>
                    <button 
                      className="btn secondary" 
                      onClick={() => setEditingBreed(null)}
                    >
                      Close
                    </button>
                  </div>
                ) : (
                  <div className="row" style={{ gap: '12px' }}>
                    <button 
                      className="btn" 
                      onClick={() => handleUpdateBreed(editingBreed.id, editingBreed)}
                    >
                      Update Breed
                    </button>
                    <button 
                      className="btn secondary" 
                      onClick={() => setEditingBreed(null)}
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
