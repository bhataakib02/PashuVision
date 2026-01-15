import { useEffect, useState } from 'react'
import Layout from '../components/Layout.jsx'
import { useMemo } from 'react'
import { QRCodeCanvas } from 'qrcode.react'
import ErrorBanner from '../components/ErrorBanner.jsx'
import LoadingSpinner from '../components/LoadingSpinner.jsx'

export default function Records() {
  const [items, setItems] = useState([])
  const [users, setUsers] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [breed, setBreed] = useState('')
  const [loc, setLoc] = useState('')

  // Helper function to format age
  const formatAge = (ageMonths) => {
    if (!ageMonths) return '—'
    const years = Math.floor(ageMonths / 12)
    const months = ageMonths % 12
    if (years === 0) return `${months} months`
    if (months === 0) return `${years} years`
    return `${years} years ${months} months`
  }

  useEffect(() => {
    loadRecords()
    loadUsers()
  }, [])

  const loadRecords = async () => {
    const token = localStorage.getItem('token')
    if (!token) {
      setError('Login required')
      setLoading(false)
      return
    }
    
    setLoading(true)
    setError('')
    
    try {
      const res = await fetch('/api/animals', {
      headers: { Authorization: `Bearer ${token}` },
    })
      
      const data = await res.json().catch(() => ({}))
      
      if (!res.ok) {
        throw new Error(data.error || `Failed to load records (${res.status})`)
      }
      
      // Ensure data is an array
      const recordsArray = Array.isArray(data) ? data : []
      console.log(`📊 Loaded ${recordsArray.length} records from API`)
      setItems(recordsArray)
    } catch (err) {
      const errorMsg = err.message || 'Failed to load records'
      setError(errorMsg)
      console.error('Load records error:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadUsers = async () => {
    const token = localStorage.getItem('token')
    if (!token) return
    
    try {
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
      })
      
      if (!res.ok) {
        // If not authorized (403) or other error, silently fail - user names won't be shown
        if (res.status === 403) {
          console.log('⚠️ Admin access required for user names. Showing IDs only.')
        }
        return
      }
      
      const data = await res.json().catch(() => ({}))
      
      // API returns { users: [...], totalUsers, activeUsers }
      const usersList = Array.isArray(data.users) ? data.users : (Array.isArray(data) ? data : [])
      setUsers(usersList)
      console.log(`👥 Loaded ${usersList.length} users for name lookup`)
    } catch (err) {
      console.error('Load users error:', err)
    }
  }

  const getUserName = (userId) => {
    if (!userId) return null
    if (users.length === 0) return null // Users not loaded yet or access denied
    
    const user = users.find(u => u.id === userId)
    return user ? user.name : null
  }

  const filtered = useMemo(() => {
    return items.filter(it => {
      const matchesQ = !q || JSON.stringify(it).toLowerCase().includes(q.toLowerCase())
      const matchesBreed = !breed || (it.predictedBreed || '').toLowerCase().includes(breed.toLowerCase())
      const matchesLoc = !loc || (it.location || '').toLowerCase().includes(loc.toLowerCase())
      return matchesQ && matchesBreed && matchesLoc
    })
  }, [items, q, breed, loc])

  const exportCsv = () => {
    const rows = [
      ['id','breed','owner','location','ageMonths','status','gpsLat','gpsLng','capturedAt']
    ]
    filtered.forEach(it => rows.push([
      it.id,
      it.predictedBreed || '',
      it.ownerName || '',
      it.location || '',
      it.ageMonths ?? '',
      it.status || '',
      it.gps?.lat ?? '',
      it.gps?.lng ?? '',
      it.capturedAt || ''
    ]))
    const csv = rows.map(r => r.map(v => String(v).replaceAll('"','""')).map(v => `"${v}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'animals.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Layout>
      <div className="container">
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h1 style={{ margin: 0 }}>📋 Animal Records</h1>
          <button 
            className="btn secondary" 
            onClick={loadRecords}
            disabled={loading}
            style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
          >
            🔄 {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        
        <ErrorBanner error={error} onDismiss={() => setError('')} />
        
        {loading && <LoadingSpinner message="Loading records..." />}
        <div className="card" style={{ marginBottom: 12 }}>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
            <input className="input" placeholder="Search" value={q} onChange={e => setQ(e.target.value)} />
            <input className="input" placeholder="Filter by breed" value={breed} onChange={e => setBreed(e.target.value)} />
            <input className="input" placeholder="Filter by location" value={loc} onChange={e => setLoc(e.target.value)} />
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn" onClick={exportCsv}>Export CSV</button>
          </div>
        </div>
        <div className="card">
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg-secondary)' }}>
                <th style={{ width: '60px', padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>Sr No</th>
                <th style={{ width: '120px', padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>Date</th>
                <th style={{ width: '150px', padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>Owner</th>
                <th style={{ width: '150px', padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>Scanned By</th>
                <th style={{ width: '200px', padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>Location</th>
                <th style={{ width: '150px', padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>Breed</th>
                <th style={{ width: '100px', padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>Age</th>
                <th style={{ width: '100px', padding: '8px', textAlign: 'left', fontWeight: 'bold' }}>Status</th>
                <th style={{ width: '250px', padding: '8px', textAlign: 'right', fontWeight: 'bold' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
            
            {filtered.map((it, index) => {
                  const user = JSON.parse(localStorage.getItem('user') || 'null')
                  const canModerate = user && user.role === 'admin'
                  // Users can edit their own records OR records with null created_by (legacy records)
                  // user.id is the user ID from localStorage, it.createdBy is the user who created the record
                  const canEdit = user && (user.role === 'admin' || (user.role === 'user' && (it.createdBy === user.id || !it.createdBy)))
                  const token = localStorage.getItem('token')
              
                  const act = async (path) => {
                    try {
                      const r = await fetch(`/api/animals/${it.id}/${path}`, { 
                        method: 'POST', 
                        headers: { Authorization: `Bearer ${token}` } 
                      })
                      
                      const data = await r.json().catch(() => ({}))
                      
                      if (!r.ok) {
                        throw new Error(data.error || `Action failed (${r.status})`)
                      }
                      
                      const updated = data.animal || data
                      setItems(prev => prev.map(x => x.id === updated.id ? updated : x))
                      alert(`✅ Record ${path === 'approve' ? 'approved' : 'rejected'} successfully`)
                    } catch (e) {
                      alert(`❌ ${e.message || 'Action failed'}`)
                      console.error('Action error:', e)
                    }
                  }
              
              const deleteRecord = async () => {
                if (!confirm('Are you sure you want to delete this record?')) return
                
                try {
                  const r = await fetch(`/api/animals/${it.id}`, { 
                    method: 'DELETE', 
                    headers: { Authorization: `Bearer ${token}` } 
                  })
                  
                  const data = await r.json().catch(() => ({}))
                  
                  if (!r.ok) {
                    throw new Error(data.error || `Delete failed (${r.status})`)
                  }
                  
                  setItems(prev => prev.filter(x => x.id !== it.id))
                  alert('✅ Record deleted successfully')
                } catch (e) {
                  alert(`❌ ${e.message || 'Delete failed'}`)
                  console.error('Delete error:', e)
                }
              }
              
              const editRecord = () => {
                // Get user role to determine which fields to show
                const user = JSON.parse(localStorage.getItem('user') || '{}')
                const isAdmin = user && user.role === 'admin'
                
                // Open edit modal
                const editModal = window.open('', '_blank', 'width=800,height=600,scrollbars=yes,resizable=yes')
                editModal.document.write(`
                  <html>
                    <head>
                      <title>Edit Record - ${it.id}</title>
                      <style>
                        body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
                        .container { max-width: 600px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                        .form-group { margin-bottom: 15px; }
                        label { display: block; margin-bottom: 5px; font-weight: bold; }
                        input, select, textarea { width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; box-sizing: border-box; }
                        .btn { padding: 10px 20px; margin: 5px; border: none; border-radius: 4px; cursor: pointer; }
                        .btn-primary { background: #007bff; color: white; }
                        .btn-secondary { background: #6c757d; color: white; }
                        .btn:hover { opacity: 0.8; }
                        .readonly { background-color: #f5f5f5; color: #666; cursor: not-allowed; }
                        .info-text { font-size: 12px; color: #666; margin-top: 5px; font-style: italic; }
                      </style>
                    </head>
                    <body>
                      <div class="container">
                        <h2>Edit Animal Record</h2>
                        ${!isAdmin ? '<p style="color: #666; font-size: 14px; margin-bottom: 20px;">Note: As a regular user, you can only edit Owner Name and Location fields.</p>' : ''}
                        <form id="editForm">
                          <div class="form-group">
                            <label>Owner Name: *</label>
                            <input type="text" id="ownerName" value="${it.ownerName || ''}" required>
                          </div>
                          <div class="form-group">
                            <label>Location: *</label>
                            <input type="text" id="location" value="${it.location || ''}" required>
                          </div>
                          <div class="form-group">
                            <label>Weight (kg):</label>
                            <input type="number" id="weight" value="${it.weight || ''}" min="0" step="0.1">
                          </div>
                          <div class="form-group">
                            <label>Health Status:</label>
                            <select id="healthStatus">
                              <option value="healthy" ${(it.healthStatus || 'healthy') === 'healthy' ? 'selected' : ''}>Healthy</option>
                              <option value="sick" ${it.healthStatus === 'sick' ? 'selected' : ''}>Sick</option>
                              <option value="injured" ${it.healthStatus === 'injured' ? 'selected' : ''}>Injured</option>
                              <option value="pregnant" ${it.healthStatus === 'pregnant' ? 'selected' : ''}>Pregnant</option>
                            </select>
                          </div>
                          <div class="form-group">
                            <label>Vaccination Status:</label>
                            <select id="vaccinationStatus">
                              <option value="unknown" ${(it.vaccinationStatus || 'unknown') === 'unknown' ? 'selected' : ''}>Unknown</option>
                              <option value="up_to_date" ${it.vaccinationStatus === 'up_to_date' ? 'selected' : ''}>Up to Date</option>
                              <option value="due" ${it.vaccinationStatus === 'due' ? 'selected' : ''}>Due</option>
                              <option value="overdue" ${it.vaccinationStatus === 'overdue' ? 'selected' : ''}>Overdue</option>
                            </select>
                          </div>
                          ${isAdmin ? `
                          <div class="form-group">
                            <label>Breed:</label>
                            <input type="text" id="breed" value="${it.predictedBreed || ''}">
                          </div>
                          <div class="form-group">
                            <label>Age (months):</label>
                            <input type="number" id="ageMonths" value="${it.ageMonths || ''}" min="1" max="600">
                          </div>
                          <div class="form-group">
                            <label>Gender:</label>
                            <select id="gender">
                              <option value="">Select Gender</option>
                              <option value="male" ${it.gender === 'male' ? 'selected' : ''}>Male</option>
                              <option value="female" ${it.gender === 'female' ? 'selected' : ''}>Female</option>
                            </select>
                          </div>
                          <div class="form-group">
                            <label>Status:</label>
                            <select id="status">
                              <option value="pending" ${it.status === 'pending' ? 'selected' : ''}>Pending</option>
                              <option value="approved" ${it.status === 'approved' ? 'selected' : ''}>Approved</option>
                              <option value="rejected" ${it.status === 'rejected' ? 'selected' : ''}>Rejected</option>
                            </select>
                          </div>
                          ` : `
                          <div class="form-group">
                            <label>Breed:</label>
                            <input type="text" id="breed" value="${it.predictedBreed || ''}" class="readonly" readonly>
                            <div class="info-text">Only admins can edit this field</div>
                          </div>
                          <div class="form-group">
                            <label>Age (months):</label>
                            <input type="number" id="ageMonths" value="${it.ageMonths || ''}" class="readonly" readonly>
                            <div class="info-text">Only admins can edit this field</div>
                          </div>
                          <div class="form-group">
                            <label>Gender:</label>
                            <input type="text" id="gender" value="${it.gender ? (it.gender.charAt(0).toUpperCase() + it.gender.slice(1)) : 'Not specified'}" class="readonly" readonly>
                            <div class="info-text">Only admins can edit this field</div>
                          </div>
                          <div class="form-group">
                            <label>Status:</label>
                            <input type="text" id="status" value="${it.status || 'pending'}" class="readonly" readonly>
                            <div class="info-text">Only admins can edit this field</div>
                          </div>
                          `}
                          <div class="form-group">
                            <button type="button" class="btn btn-primary" onclick="saveRecord()">Save Changes</button>
                            <button type="button" class="btn btn-secondary" onclick="window.close()">Cancel</button>
                          </div>
                        </form>
                      </div>
                      <script>
                        const isAdmin = ${isAdmin};
                        
                        function saveRecord() {
                          const data = {
                            ownerName: document.getElementById('ownerName').value,
                            location: document.getElementById('location').value
                          };
                          
                          // All users (admin and regular) can update health status, vaccination status, and weight
                          const weightInput = document.getElementById('weight');
                          const healthStatusInput = document.getElementById('healthStatus');
                          const vaccinationStatusInput = document.getElementById('vaccinationStatus');
                          
                          if (weightInput && weightInput.value) {
                            data.weight = parseFloat(weightInput.value) || null;
                          }
                          if (healthStatusInput && healthStatusInput.value) {
                            data.healthStatus = healthStatusInput.value;
                          }
                          if (vaccinationStatusInput && vaccinationStatusInput.value) {
                            data.vaccinationStatus = vaccinationStatusInput.value;
                          }
                          
                          // Only admins can update other fields
                          if (isAdmin) {
                            const breedInput = document.getElementById('breed');
                            const ageInput = document.getElementById('ageMonths');
                            const genderInput = document.getElementById('gender');
                            const statusInput = document.getElementById('status');
                            
                            if (breedInput && !breedInput.readOnly) {
                              data.predictedBreed = breedInput.value;
                            }
                            if (ageInput && !ageInput.readOnly && ageInput.value) {
                              data.ageMonths = parseInt(ageInput.value);
                            }
                            if (genderInput && !genderInput.readOnly && genderInput.value) {
                              data.gender = genderInput.value;
                            }
                            if (statusInput && !statusInput.readOnly) {
                              data.status = statusInput.value;
                            }
                          }
                          
                          fetch(\`/api/animals/\${it.id}\`, {
                            method: 'PUT',
                            headers: {
                              'Content-Type': 'application/json',
                              'Authorization': 'Bearer ' + localStorage.getItem('token')
                            },
                            body: JSON.stringify(data)
                          })
                          .then(async response => {
                            if (!response.ok) {
                              const errorText = await response.text();
                              let errorMsg = 'Failed to update record';
                              try {
                                const errorData = JSON.parse(errorText);
                                errorMsg = errorData.error || errorMsg;
                              } catch {
                                errorMsg = errorText || errorMsg;
                              }
                              throw new Error(errorMsg);
                            }
                            return response.json();
                          })
                          .then(result => {
                            alert('✅ Record updated successfully!');
                            window.close();
                            window.opener.location.reload();
                          })
                          .catch(error => {
                            alert('❌ Error updating record: ' + error.message);
                          });
                        }
                      </script>
                    </body>
                  </html>
                `)
              }
              
                  return (
                <tr key={it.id} style={{ 
                  backgroundColor: index % 2 === 0 ? 'transparent' : 'var(--color-bg-secondary)'
                }}>
                  <td style={{ width: '60px', padding: '8px', fontSize: '12px', fontWeight: 'bold', color: '#666' }}>
                    {index + 1}
                  </td>
                  <td style={{ width: '120px', padding: '8px', fontSize: '12px' }}>
                    {it.capturedAt ? new Date(it.capturedAt).toLocaleDateString() : '—'}
                  </td>
                  <td style={{ width: '150px', padding: '8px', fontSize: '12px' }}>
                    {it.ownerName || '—'}
                  </td>
                  <td style={{ width: '150px', padding: '8px', fontSize: '12px' }}>
                    {it.createdBy ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontWeight: '500', color: '#333' }}>
                          {getUserName(it.createdBy) || 'Unknown User'}
                        </span>
                        <span style={{ fontSize: '11px', color: '#666' }}>
                          ID: {it.createdBy.slice(0, 8)}
                        </span>
                      </div>
                    ) : (
                      <span style={{ color: '#999' }}>N/A</span>
                    )}
                  </td>
                  <td style={{ width: '200px', padding: '8px', fontSize: '12px' }}>
                    {it.location || '—'}
                  </td>
                  <td style={{ width: '150px', padding: '8px', fontSize: '12px' }}>
                    {it.predictedBreed || '—'}
                  </td>
                  <td style={{ width: '100px', padding: '8px', fontSize: '12px' }}>
                    {formatAge(it.ageMonths)}
                  </td>
                  <td style={{ width: '100px', padding: '8px' }}>
                    <span style={{
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: it.status === 'approved' ? '#4CAF50' : 
                                      it.status === 'rejected' ? '#F44336' : '#FF9800',
                      color: 'white',
                      fontSize: '10px',
                      fontWeight: 'bold'
                    }}>
                      {it.status?.toUpperCase() || 'PENDING'}
                    </span>
                  </td>
                  <td style={{ width: '250px', padding: '8px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
                      <button 
                        className="btn secondary" 
                        style={{ 
                          fontSize: '13px', 
                          padding: '8px 12px', 
                          minWidth: '36px',
                          height: '36px',
                          borderRadius: '6px',
                          border: '2px solid #007bff',
                          background: '#ffffff',
                          color: '#007bff',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          fontWeight: 'bold',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                          transition: 'all 0.2s ease'
                        }}
                        onClick={() => {
                          const formatHealthStatus = (status) => {
                            if (!status) return 'Not specified'
                            return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ')
                          }
                          
                          const formatVaccinationStatus = (status) => {
                            if (!status) return 'Not specified'
                            return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ')
                          }
                          
                          // Create a styled modal popup
                          const detailsModal = window.open('', '_blank', 'width=700,height=700,scrollbars=yes,resizable=yes')
                          detailsModal.document.write(`
                            <html>
                              <head>
                                <title>Record Details - ${it.id}</title>
                                <style>
                                  * { margin: 0; padding: 0; box-sizing: border-box; }
                                  body { 
                                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                                    padding: 20px;
                                    min-height: 100vh;
                                  }
                                  .modal-container {
                                    max-width: 650px;
                                    margin: 0 auto;
                                    background: white;
                                    border-radius: 16px;
                                    box-shadow: 0 20px 60px rgba(0,0,0,0.3);
                                    overflow: hidden;
                                  }
                                  .modal-header {
                                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                                    color: white;
                                    padding: 24px 28px;
                                    font-size: 24px;
                                    font-weight: 600;
                                    display: flex;
                                    align-items: center;
                                    justify-content: space-between;
                                  }
                                  .modal-header h2 {
                                    font-size: 24px;
                                    font-weight: 600;
                                    margin: 0;
                                  }
                                  .close-btn {
                                    background: rgba(255,255,255,0.2);
                                    border: none;
                                    color: white;
                                    width: 36px;
                                    height: 36px;
                                    border-radius: 50%;
                                    cursor: pointer;
                                    font-size: 20px;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    transition: all 0.2s;
                                  }
                                  .close-btn:hover {
                                    background: rgba(255,255,255,0.3);
                                    transform: scale(1.1);
                                  }
                                  .modal-body {
                                    padding: 28px;
                                    max-height: 500px;
                                    overflow-y: auto;
                                  }
                                  .detail-row {
                                    display: flex;
                                    padding: 16px 0;
                                    border-bottom: 1px solid #e9ecef;
                                    align-items: flex-start;
                                  }
                                  .detail-row:last-child {
                                    border-bottom: none;
                                  }
                                  .detail-label {
                                    font-weight: 600;
                                    color: #495057;
                                    min-width: 160px;
                                    font-size: 14px;
                                    text-transform: uppercase;
                                    letter-spacing: 0.5px;
                                  }
                                  .detail-value {
                                    color: #212529;
                                    font-size: 15px;
                                    flex: 1;
                                    word-break: break-word;
                                  }
                                  .badge {
                                    display: inline-block;
                                    padding: 4px 12px;
                                    border-radius: 12px;
                                    font-size: 12px;
                                    font-weight: 600;
                                    text-transform: uppercase;
                                    letter-spacing: 0.5px;
                                  }
                                  .badge-approved {
                                    background: #d4edda;
                                    color: #155724;
                                  }
                                  .badge-pending {
                                    background: #fff3cd;
                                    color: #856404;
                                  }
                                  .badge-rejected {
                                    background: #f8d7da;
                                    color: #721c24;
                                  }
                                  .badge-healthy {
                                    background: #d1ecf1;
                                    color: #0c5460;
                                  }
                                  .badge-sick {
                                    background: #f8d7da;
                                    color: #721c24;
                                  }
                                  .badge-injured {
                                    background: #fff3cd;
                                    color: #856404;
                                  }
                                  .badge-pregnant {
                                    background: #e2e3f5;
                                    color: #383d41;
                                  }
                                  .badge-up-to-date {
                                    background: #d4edda;
                                    color: #155724;
                                  }
                                  .badge-due {
                                    background: #fff3cd;
                                    color: #856404;
                                  }
                                  .badge-overdue {
                                    background: #f8d7da;
                                    color: #721c24;
                                  }
                                  .modal-footer {
                                    padding: 20px 28px;
                                    background: #f8f9fa;
                                    border-top: 1px solid #e9ecef;
                                    text-align: right;
                                  }
                                  .btn-close {
                                    background: #667eea;
                                    color: white;
                                    border: none;
                                    padding: 10px 24px;
                                    border-radius: 8px;
                                    font-size: 14px;
                                    font-weight: 600;
                                    cursor: pointer;
                                    transition: all 0.2s;
                                  }
                                  .btn-close:hover {
                                    background: #5568d3;
                                    transform: translateY(-1px);
                                    box-shadow: 0 4px 8px rgba(0,0,0,0.2);
                                  }
                                  ::-webkit-scrollbar {
                                    width: 8px;
                                  }
                                  ::-webkit-scrollbar-track {
                                    background: #f1f1f1;
                                  }
                                  ::-webkit-scrollbar-thumb {
                                    background: #888;
                                    border-radius: 4px;
                                  }
                                  ::-webkit-scrollbar-thumb:hover {
                                    background: #555;
                                  }
                                </style>
                              </head>
                              <body>
                                <div class="modal-container">
                                  <div class="modal-header">
                                    <h2>📋 Record Details</h2>
                                    <button class="close-btn" onclick="window.close()">×</button>
                                  </div>
                                  <div class="modal-body">
                                    <div class="detail-row">
                                      <div class="detail-label">ID</div>
                                      <div class="detail-value">${it.id}</div>
                                    </div>
                                    <div class="detail-row">
                                      <div class="detail-label">Owner</div>
                                      <div class="detail-value">${it.ownerName || 'N/A'}</div>
                                    </div>
                                    <div class="detail-row">
                                      <div class="detail-label">Location</div>
                                      <div class="detail-value">${it.location || 'N/A'}</div>
                                    </div>
                                    <div class="detail-row">
                                      <div class="detail-label">Breed</div>
                                      <div class="detail-value">${it.predictedBreed || 'Not predicted'}</div>
                                    </div>
                                    <div class="detail-row">
                                      <div class="detail-label">Age</div>
                                      <div class="detail-value">${formatAge(it.ageMonths)}</div>
                                    </div>
                                    <div class="detail-row">
                                      <div class="detail-label">Gender</div>
                                      <div class="detail-value">${it.gender ? (it.gender.charAt(0).toUpperCase() + it.gender.slice(1)) : 'Not specified'}</div>
                                    </div>
                                    <div class="detail-row">
                                      <div class="detail-label">Weight</div>
                                      <div class="detail-value">${it.weight ? `${it.weight} kg` : 'Not specified'}</div>
                                    </div>
                                    <div class="detail-row">
                                      <div class="detail-label">Health Status</div>
                                      <div class="detail-value">
                                        <span class="badge badge-${(it.healthStatus || 'healthy').toLowerCase()}">
                                          ${formatHealthStatus(it.healthStatus)}
                                        </span>
                                      </div>
                                    </div>
                                    <div class="detail-row">
                                      <div class="detail-label">Vaccination Status</div>
                                      <div class="detail-value">
                                        <span class="badge badge-${(it.vaccinationStatus || 'unknown').replace(/_/g, '-').toLowerCase()}">
                                          ${formatVaccinationStatus(it.vaccinationStatus)}
                                        </span>
                                      </div>
                                    </div>
                                    <div class="detail-row">
                                      <div class="detail-label">Status</div>
                                      <div class="detail-value">
                                        <span class="badge badge-${(it.status || 'pending').toLowerCase()}">
                                          ${(it.status || 'pending').charAt(0).toUpperCase() + (it.status || 'pending').slice(1)}
                                        </span>
                                      </div>
                                    </div>
                                    <div class="detail-row">
                                      <div class="detail-label">User ID</div>
                                      <div class="detail-value">${it.createdBy ? it.createdBy.slice(0, 8) + '...' : 'N/A'}</div>
                                    </div>
                                    <div class="detail-row">
                                      <div class="detail-label">GPS Coordinates</div>
                                      <div class="detail-value">${it.gps ? `${it.gps.lat}, ${it.gps.lng}` : 'Not available'}</div>
                                    </div>
                                    <div class="detail-row">
                                      <div class="detail-label">Captured At</div>
                                      <div class="detail-value">${it.capturedAt ? new Date(it.capturedAt).toLocaleString() : 'Not available'}</div>
                                    </div>
                                  </div>
                                  <div class="modal-footer">
                                    <button class="btn-close" onclick="window.close()">Close</button>
                                  </div>
                                </div>
                              </body>
                            </html>
                          `)
                        }}
                        title="View Details"
                      >
                        👁️
                      </button>
                      <button 
                        className="btn" 
                        style={{ 
                          fontSize: '13px', 
                          padding: '8px 12px', 
                          minWidth: '36px',
                          height: '36px',
                          borderRadius: '6px',
                          background: '#28a745',
                          color: 'white',
                          border: '2px solid #28a745',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          fontWeight: 'bold',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                          transition: 'all 0.2s ease'
                        }}
                        onClick={() => {
                          // Open QR code scanner in new window
                          const qrWindow = window.open('', '_blank', 'width=500,height=600')
                          qrWindow.document.write(`
                            <html>
                              <head>
                                <title>QR Code Scanner - ${it.id}</title>
                                <style>
                                  body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; text-align: center; }
                                  .container { max-width: 450px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.15); }
                                  .scanner { margin: 20px 0; }
                                  .result { margin: 20px 0; padding: 10px; background: #e8f5e8; border-radius: 4px; }
                                  .btn { 
                                    padding: 12px 24px; 
                                    margin: 8px; 
                                    border: 2px solid; 
                                    border-radius: 8px; 
                                    cursor: pointer; 
                                    font-size: 14px;
                                    font-weight: bold;
                                    box-shadow: 0 3px 6px rgba(0,0,0,0.15);
                                    transition: all 0.2s ease;
                                    min-width: 120px;
                                    height: 44px;
                                    display: inline-flex;
                                    align-items: center;
                                    justify-content: center;
                                  }
                                  .btn:hover { 
                                    transform: translateY(-2px);
                                    box-shadow: 0 5px 12px rgba(0,0,0,0.2);
                                  }
                                  .btn-primary { background: #007bff; color: white; border-color: #007bff; }
                                  .btn-success { background: #28a745; color: white; border-color: #28a745; }
                                  .btn-danger { background: #dc3545; color: white; border-color: #dc3545; }
                                  #video { width: 100%; max-width: 350px; border: 3px solid #007bff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); }
                                  #qrcode { margin: 20px 0; padding: 20px; background: #f8f9fa; border-radius: 8px; border: 2px solid #e9ecef; max-width: 400px; }
                                  h3 { color: #333; margin-bottom: 25px; font-size: 24px; }
                                  p { color: #666; margin: 10px 0; font-size: 14px; }
                                </style>
                              </head>
                              <body>
                                <div class="container">
                                  <h3>QR Code Scanner</h3>
                                  <div class="scanner">
                                    <video id="video" autoplay></video>
                                    <div id="result" class="result" style="display: none;"></div>
                    </div>
                                  <div id="qrcode"></div>
                                  <p><strong>Record ID:</strong> ${it.id}</p>
                                  <p><strong>Owner:</strong> ${it.ownerName}</p>
                                  <button class="btn btn-success" onclick="startScanning()">Start Scanning</button>
                                  <button class="btn btn-danger" onclick="stopScanning()">Stop Scanning</button>
                                  <button class="btn btn-primary" onclick="generateQR()">Generate QR Code</button>
              </div>
                                
                                <script src="https://cdn.jsdelivr.net/npm/qr-scanner@1.4.2/qr-scanner.umd.min.js"></script>
                                <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"></script>
                                <script>
                                  // Fallback QR code generation if main library fails
                                  if (typeof QRCode === 'undefined') {
                                    window.QRCode = {
                                      toCanvas: function(canvas, text, options, callback) {
                                        try {
                                          const qr = qrcode(0, 'M');
                                          qr.addData(text);
                                          qr.make();
                                          const ctx = canvas.getContext('2d');
                                          const size = options.width || 200;
                                          canvas.width = size;
                                          canvas.height = size;
                                          const cellSize = size / qr.getModuleCount();
                                          for (let row = 0; row < qr.getModuleCount(); row++) {
                                            for (let col = 0; col < qr.getModuleCount(); col++) {
                                              ctx.fillStyle = qr.isDark(row, col) ? '#000000' : '#FFFFFF';
                                              ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
                                            }
                                          }
                                          if (callback) callback(null);
                                        } catch (e) {
                                          if (callback) callback(e);
                                        }
                                      }
                                    };
                                  }
                                </script>
                                <script>
                                  let qrScanner = null;
                                  
                                  function startScanning() {
                                    const video = document.getElementById('video');
                                    const result = document.getElementById('result');
                                    
                                    qrScanner = new QrScanner(video, (result) => {
                                      document.getElementById('result').innerHTML = 'Scanned: ' + result;
                                      document.getElementById('result').style.display = 'block';
                                    });
                                    
                                    qrScanner.start();
                                  }
                                  
                                  function stopScanning() {
                                    if (qrScanner) {
                                      qrScanner.stop();
                                      qrScanner = null;
                                    }
                                  }
                                  
                                  function generateQR() {
                                    const qrDiv = document.getElementById('qrcode');
                                    qrDiv.innerHTML = '';
                                    
                                    // Check if QRCode library is loaded
                                    if (typeof QRCode === 'undefined') {
                                      qrDiv.innerHTML = '<p style="color: red;">QR Code library not loaded. Please refresh the page.</p>';
                                      return;
                                    }
                                    
                                    // Create canvas element
                                    const canvas = document.createElement('canvas');
                                    qrDiv.appendChild(canvas);
                                    
                                    // Create detailed animal information for QR code
                                    const animalData = {
                                      id: '${it.id}',
                                      owner: '${it.ownerName || 'Unknown'}',
                                      location: '${it.location || 'Unknown'}',
                                      breed: '${it.predictedBreed || 'Unknown'}',
                                      age: '${formatAge(it.ageMonths)}',
                                      status: '${it.status || 'pending'}',
                                      createdBy: '${it.createdBy || 'N/A'}',
                                      vaccinated: '${it.vaccinated || 'Unknown'}',
                                      lastVaccination: '${it.lastVaccination || 'Not recorded'}',
                                      createdAt: '${it.capturedAt || it.createdAt || 'Unknown'}'
                                    };
                                    
                                    const qrText = JSON.stringify(animalData);
                                    
                                    try {
                                      QRCode.toCanvas(canvas, qrText, {
                                        width: 250,
                                        margin: 2,
                                        color: { 
                                          dark: '#000000', 
                                          light: '#FFFFFF' 
                                        }
                                      }, function (error) {
                                        if (error) {
                                          console.error('QR Code generation error:', error);
                                          qrDiv.innerHTML = '<p style="color: red;">Error generating QR code: ' + error.message + '</p>';
                                        } else {
                                          console.log('QR Code generated successfully');
                                          // Add detailed labels below the QR code
                                          const detailsDiv = document.createElement('div');
                                          detailsDiv.style.marginTop = '15px';
                                          detailsDiv.style.textAlign = 'left';
                                          detailsDiv.style.fontSize = '11px';
                                          detailsDiv.style.color = '#666';
                                          detailsDiv.style.lineHeight = '1.4';
                                          
                                          detailsDiv.innerHTML = \`
                                            <div style="margin-bottom: 8px;"><strong>Animal ID:</strong> \${animalData.id}</div>
                                            <div style="margin-bottom: 8px;"><strong>Owner:</strong> \${animalData.owner}</div>
                                            <div style="margin-bottom: 8px;"><strong>Location:</strong> \${animalData.location}</div>
                                            <div style="margin-bottom: 8px;"><strong>Breed:</strong> \${animalData.breed}</div>
                                            <div style="margin-bottom: 8px;"><strong>Age:</strong> \${animalData.age}</div>
                                            <div style="margin-bottom: 8px;"><strong>Status:</strong> \${animalData.status}</div>
                                            <div style="margin-bottom: 8px;"><strong>User ID:</strong> \${animalData.createdBy ? animalData.createdBy.slice(0, 8) : 'N/A'}</div>
                                            <div style="margin-bottom: 8px;"><strong>Vaccinated:</strong> \${animalData.vaccinated}</div>
                                            <div style="margin-bottom: 8px;"><strong>Last Vaccination:</strong> \${animalData.lastVaccination}</div>
                                            <div><strong>Created:</strong> \${animalData.createdAt}</div>
                                          \`;
                                          
                                          qrDiv.appendChild(detailsDiv);
                                        }
                                      });
                                    } catch (e) {
                                      console.error('QR Code generation exception:', e);
                                      qrDiv.innerHTML = '<p style="color: red;">Exception generating QR code: ' + e.message + '</p>';
                                    }
                                  }
                                  
                                  // Auto-generate QR code on load with delay to ensure libraries are loaded
                                  window.onload = function() {
                                    setTimeout(function() {
                                      generateQR();
                                    }, 500);
                                  };
                                </script>
                              </body>
                            </html>
                          `)
                        }}
                        title="View QR Code"
                      >
                        📱
                      </button>
                      {canModerate && it.status !== 'approved' && (
                        <>
                          <button 
                            className="btn" 
                            style={{ 
                              fontSize: '13px', 
                              padding: '8px 12px', 
                              minWidth: '36px',
                              height: '36px',
                              borderRadius: '6px',
                              background: '#28a745',
                              color: 'white',
                              border: '2px solid #28a745',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              fontWeight: 'bold',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                              transition: 'all 0.2s ease'
                            }}
                            onClick={() => act('approve')}
                            title="Approve Record"
                          >
                            ✅
                          </button>
                          <button 
                            className="btn" 
                            style={{ 
                              fontSize: '13px', 
                              padding: '8px 12px', 
                              minWidth: '36px',
                              height: '36px',
                              borderRadius: '6px',
                              background: '#dc3545',
                              color: 'white',
                              border: '2px solid #dc3545',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              fontWeight: 'bold',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                              transition: 'all 0.2s ease'
                            }}
                            onClick={() => act('reject')}
                            title="Reject Record"
                          >
                            ❌
                          </button>
                        </>
                      )}
                      {canEdit && (
                        <>
                          <button 
                            className="btn" 
                            style={{ 
                              fontSize: '13px', 
                              padding: '8px 12px', 
                              minWidth: '36px',
                              height: '36px',
                              borderRadius: '6px',
                              background: '#fd7e14',
                              color: 'white',
                              border: '2px solid #fd7e14',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              fontWeight: 'bold',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                              transition: 'all 0.2s ease'
                            }}
                            onClick={editRecord}
                            title="Edit Record"
                          >
                            ✏️
                          </button>
                          <button 
                            className="btn" 
                            style={{ 
                              fontSize: '13px', 
                              padding: '8px 12px', 
                              minWidth: '36px',
                              height: '36px',
                              borderRadius: '6px',
                              background: '#6c757d',
                              color: 'white',
                              border: '2px solid #6c757d',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                              fontWeight: 'bold',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                              transition: 'all 0.2s ease'
                            }}
                            onClick={deleteRecord}
                            title="Delete Record"
                          >
                            🗑️
                          </button>
                        </>
                      )}
            </div>
                  </td>
                </tr>
              )
            })}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  )
}


