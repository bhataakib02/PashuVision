import { useState, useEffect } from 'react'
import Header from '../components/Header.jsx'

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const [filteredUsers, setFilteredUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showAddUser, setShowAddUser] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [viewingUser, setViewingUser] = useState(null)
  const [filters, setFilters] = useState({
    role: '',
    status: '',
    search: ''
  })
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    phone: '',
    role: 'user',
    password: '',
    permissions: []
  })

  useEffect(() => {
    loadUsers(true)
  }, [])

  useEffect(() => {
    applyFilters()
  }, [users, filters])

  const loadUsers = async (showLoading = false) => {
    const token = localStorage.getItem('token')
    if (!token) return setError('Login required')
    
    if (showLoading) setLoading(true)
    setError('')
    
    try {
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` }
      })
      
      if (!res.ok) throw new Error('Failed to load users')
      
      const data = await res.json()
      const usersList = Array.isArray(data.users) ? data.users : (Array.isArray(data) ? data : [])
      setUsers(usersList)
    } catch (err) {
      setError(err.message || 'Failed to load users')
      console.error('Load users error:', err)
    } finally {
      if (showLoading) setLoading(false)
    }
  }

  const applyFilters = () => {
    let filtered = [...users]

    if (filters.role) {
      filtered = filtered.filter(user => user.role === filters.role)
    }
    
    if (filters.status) {
      filtered = filtered.filter(user => {
        const userIsActive = user.isActive !== false && user.is_active !== false
        return userIsActive === (filters.status === 'active')
      })
    }
    
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase()
      filtered = filtered.filter(user => 
        user.name?.toLowerCase().includes(searchTerm) ||
        user.email?.toLowerCase().includes(searchTerm) ||
        user.village?.toLowerCase().includes(searchTerm)
      )
    }

    setFilteredUsers(filtered)
  }

  const handleAddUser = async (e) => {
    e.preventDefault()
    const token = localStorage.getItem('token')
    if (!token) return setError('Login required')
    
    setLoading(true)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(newUser)
      })
      
      if (!res.ok) throw new Error('Failed to add user')
      
      await loadUsers()
      setShowAddUser(false)
      setNewUser({
        name: '',
        email: '',
        phone: '',
        role: 'user',
        password: '',
        permissions: []
      })
      
      alert('✅ User added successfully')
    } catch (err) {
      setError(err.message || 'Failed to add user')
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateUser = async (userId, updates) => {
    const token = localStorage.getItem('token')
    if (!token) {
      setError('Login required')
      alert('❌ Login required')
      return
    }
    
    setLoading(true)
    setError('')
    
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      })
      
      const data = await res.json().catch(() => ({}))
      
      if (!res.ok) {
        const errorMsg = data.error || `Failed to update user (${res.status})`
        throw new Error(errorMsg)
      }
      
      await loadUsers()
      setEditingUser(null)
      alert('✅ User updated successfully')
    } catch (err) {
      const errorMsg = err.message || 'Failed to update user'
      setError(errorMsg)
      alert(`❌ ${errorMsg}`)
      console.error('Update user error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteUser = async (userId) => {
    if (!confirm('Are you sure you want to delete this user?')) return
    
    const token = localStorage.getItem('token')
    if (!token) {
      setError('Login required')
      alert('❌ Login required')
      return
    }
    
    setError('')
    const previousLoading = loading
    setLoading(true)
    
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      })
      
      const data = await res.json().catch(() => ({}))
      
      if (!res.ok) {
        const errorMsg = data.error || `Failed to delete user (${res.status})`
        throw new Error(errorMsg)
      }
      
      // Immediately remove from local state for instant UI update
      setUsers(prevUsers => prevUsers.filter(u => u.id !== userId))
      
      // Then reload from server to ensure consistency
      await loadUsers()
      
      alert('✅ User deleted successfully')
    } catch (err) {
      const errorMsg = err.message || 'Failed to delete user'
      setError(errorMsg)
      alert(`❌ ${errorMsg}`)
      console.error('Delete user error:', err)
      // Reload users on error to ensure UI is in sync
      await loadUsers()
    } finally {
      setLoading(previousLoading)
    }
  }

  const handleToggleUserStatus = async (userId, isActive) => {
    const token = localStorage.getItem('token')
    if (!token) return setError('Login required')
    
    try {
      const res = await fetch(`/api/admin/users/${userId}/status`, {
        method: 'PUT',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isActive: !isActive })
      })
      
      if (!res.ok) throw new Error('Failed to update user status')
      
      await loadUsers()
      alert(`✅ User ${!isActive ? 'activated' : 'deactivated'} successfully`)
    } catch (err) {
      setError(err.message || 'Failed to update user status')
    }
  }

  const getRolePermissions = (role) => {
    const permissions = {
      user: ['create_animal', 'view_own_animals', 'update_own_animals'],
      admin: ['all']
    }
    return permissions[role] || []
  }

  const getRoleColor = (role) => {
    const colors = {
      admin: '#9C27B0',
      user: '#2196F3'
    }
    return colors[role] || '#666'
  }

  const getStatusBadge = (isActive) => (
    <span style={{
      padding: '4px 8px',
      borderRadius: '4px',
      backgroundColor: isActive ? '#4CAF50' : '#F44336',
      color: 'white',
      fontSize: '12px',
      fontWeight: 'bold'
    }}>
      {isActive ? 'ACTIVE' : 'INACTIVE'}
    </span>
  )

  return (
    <>
      <Header />
      <div className="container">
        {/* Error Display */}
        {error && (
          <div className="card" style={{ 
            marginBottom: 16, 
            backgroundColor: '#ffebee', 
            border: '2px solid #f44336',
            color: '#c62828'
          }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong>❌ Error:</strong> {error}
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
            <div>⏳ Loading users...</div>
          </div>
        )}

        <div className="card">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <h1>👥 User Management</h1>
            <div className="row" style={{ gap: 8 }}>
              <button 
                className="btn" 
                onClick={() => setShowAddUser(true)}
              >
                ➕ Add User
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="card" style={{ marginTop: 16 }}>
            <h3>🔍 Filters</h3>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              <div className="stack">
                <label>Role</label>
                <select 
                  className="select" 
                  value={filters.role} 
                  onChange={e => setFilters(prev => ({ ...prev, role: e.target.value }))}
                >
                  <option value="">All Roles</option>
                  <option value="admin">Admin</option>
                  <option value="user">User</option>
                </select>
              </div>
              <div className="stack">
                <label>Status</label>
                <select 
                  className="select" 
                  value={filters.status} 
                  onChange={e => setFilters(prev => ({ ...prev, status: e.target.value }))}
                >
                  <option value="">All Status</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="stack">
                <label>Search</label>
                <input 
                  className="input" 
                  value={filters.search} 
                  onChange={e => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  placeholder="Search by name, email, or village"
                />
              </div>
            </div>
          </div>

          {/* Users List */}
          <div className="card" style={{ marginTop: 16 }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3>👤 Users ({filteredUsers.length})</h3>
            </div>

            {filteredUsers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-muted)' }}>
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>👥</div>
                <h3>No users found</h3>
                <p>Try adjusting your filters or add a new user.</p>
              </div>
            ) : (
              <div className="table">
                <div className="row" style={{ fontWeight: 'bold', background: 'var(--color-bg-secondary)' }}>
                  <div style={{ width: '200px' }}>Name</div>
                  <div style={{ width: '200px' }}>Email</div>
                  <div style={{ width: '120px' }}>Role</div>
                  <div style={{ width: '150px' }}>Location</div>
                  <div style={{ width: '100px' }}>Status</div>
                  <div style={{ width: '120px' }}>Last Active</div>
                  <div style={{ width: '200px' }}>Actions</div>
                </div>
                
                {filteredUsers.map(user => (
                  <div key={user.id} className="row">
                    <div style={{ width: '200px', fontSize: '12px' }}>
                      <div style={{ fontWeight: 'bold' }}>{user.name}</div>
                      <div style={{ color: 'var(--color-muted)' }}>{user.phone || 'No phone'}</div>
                    </div>
                    <div style={{ width: '200px', fontSize: '12px' }}>
                      {user.email}
                    </div>
                    <div style={{ width: '120px' }}>
                      <span style={{
                        padding: '2px 6px',
                        borderRadius: '4px',
                        backgroundColor: getRoleColor(user.role),
                        color: 'white',
                        fontSize: '10px',
                        fontWeight: 'bold'
                      }}>
                        {user.role.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ width: '150px', fontSize: '12px' }}>
                      {user.village ? `${user.village}, ${user.district}` : 'Not specified'}
                    </div>
                    <div style={{ width: '100px' }}>
                      {getStatusBadge(user.isActive !== false && user.is_active !== false)}
                    </div>
                    <div style={{ width: '120px', fontSize: '12px' }}>
                      {user.lastActive ? 
                        new Date(user.lastActive).toLocaleDateString() : 
                        'Never'
                      }
                    </div>
                    <div style={{ width: '200px' }}>
                      <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                        <button 
                          className="btn secondary" 
                          style={{ fontSize: '10px', padding: '4px 8px' }}
                          onClick={() => setViewingUser(user)}
                          title="View User Info"
                        >
                          👁️ View
                        </button>
                        <button 
                          className="btn secondary" 
                          style={{ fontSize: '10px', padding: '4px 8px' }}
                          onClick={() => setEditingUser(user)}
                          title="Edit User"
                        >
                          ✏️ Edit
                        </button>
                        <button 
                          className="btn" 
                          style={{ 
                            fontSize: '10px', 
                            padding: '4px 8px',
                            backgroundColor: (user.isActive !== false && user.is_active !== false) ? '#F44336' : '#4CAF50'
                          }}
                          onClick={() => handleToggleUserStatus(user.id, user.isActive !== false && user.is_active !== false)}
                          title={(user.isActive !== false && user.is_active !== false) ? 'Deactivate' : 'Activate'}
                        >
                          {(user.isActive !== false && user.is_active !== false) ? '🔒' : '🔓'}
                        </button>
                        <button 
                          className="btn" 
                          style={{ fontSize: '10px', padding: '4px 8px', backgroundColor: '#F44336' }}
                          onClick={() => handleDeleteUser(user.id)}
                          title="Delete User"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* User Statistics */}
          <div className="card" style={{ marginTop: 16 }}>
            <h3>📊 User Statistics</h3>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16 }}>
              <div className="card" style={{ textAlign: 'center' }}>
                <h4>Total Users</h4>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#2196F3' }}>
                  {users.length}
                </div>
              </div>
              <div className="card" style={{ textAlign: 'center' }}>
                <h4>Active Users</h4>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#4CAF50' }}>
                  {users.filter(u => u.isActive !== false && u.is_active !== false).length}
                </div>
              </div>
              <div className="card" style={{ textAlign: 'center' }}>
                <h4>Users</h4>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#2196F3' }}>
                  {users.filter(u => u.role === 'user').length}
                </div>
              </div>
              <div className="card" style={{ textAlign: 'center' }}>
                <h4>Admins</h4>
                <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#9C27B0' }}>
                  {users.filter(u => u.role === 'admin').length}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Add User Modal */}
        {showAddUser && (
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
                <h2>➕ Add New User</h2>
                <button 
                  className="btn secondary" 
                  onClick={() => setShowAddUser(false)}
                >
                  ✕ Close
                </button>
              </div>

              <form onSubmit={handleAddUser} className="stack" style={{ gap: '16px' }}>
                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="stack">
                    <label>Name *</label>
                    <input 
                      className="input" 
                      value={newUser.name} 
                      onChange={e => setNewUser(prev => ({ ...prev, name: e.target.value }))}
                      required 
                    />
                  </div>
                  <div className="stack">
                    <label>Email *</label>
                    <input 
                      className="input" 
                      type="email" 
                      value={newUser.email} 
                      onChange={e => setNewUser(prev => ({ ...prev, email: e.target.value }))}
                      required 
                    />
                  </div>
                </div>

                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="stack">
                    <label>Phone</label>
                    <input 
                      className="input" 
                      type="tel" 
                      value={newUser.phone} 
                      onChange={e => setNewUser(prev => ({ ...prev, phone: e.target.value }))}
                    />
                  </div>
                  <div className="stack">
                    <label>Role *</label>
                    <select 
                      className="select" 
                      value={newUser.role} 
                      onChange={e => setNewUser(prev => ({ ...prev, role: e.target.value }))}
                      required
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>

                <div className="stack">
                  <label>Password *</label>
                  <input 
                    className="input" 
                    type="password" 
                    value={newUser.password} 
                    onChange={e => setNewUser(prev => ({ ...prev, password: e.target.value }))}
                    required 
                  />
                </div>


                <div className="row" style={{ gap: '12px' }}>
                  <button 
                    className="btn" 
                    type="submit"
                    disabled={loading}
                  >
                    {loading ? 'Adding...' : 'Add User'}
                  </button>
                  <button 
                    className="btn secondary" 
                    type="button"
                    onClick={() => setShowAddUser(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* View User Info Modal */}
        {viewingUser && (
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
                <h2>👤 User Information</h2>
                <button 
                  className="btn secondary" 
                  onClick={() => setViewingUser(null)}
                >
                  ✕ Close
                </button>
              </div>

              <div className="stack" style={{ gap: '20px' }}>
                {/* Profile Photo */}
                <div style={{ textAlign: 'center' }}>
                  {(viewingUser.photoUrl || viewingUser.photoBase64) ? (
                    <img 
                      src={viewingUser.photoBase64 || (viewingUser.photoUrl?.startsWith('data:') ? viewingUser.photoUrl : (viewingUser.photoUrl?.startsWith('/uploads/') ? `${window.location.origin}${viewingUser.photoUrl}` : viewingUser.photoUrl))} 
                      alt="Profile" 
                      style={{
                        width: '150px',
                        height: '150px',
                        borderRadius: '12px',
                        objectFit: 'cover',
                        border: '3px solid #ddd',
                        margin: '0 auto',
                        display: 'block'
                      }}
                      onError={(e) => {
                        console.error('Error loading user photo:', viewingUser.photoUrl)
                        e.target.style.display = 'none'
                        const placeholder = e.target.nextElementSibling
                        if (placeholder) placeholder.style.display = 'flex'
                      }}
                    />
                  ) : null}
                  <div style={{
                    width: '150px',
                    height: '150px',
                    borderRadius: '12px',
                    background: '#e0e0e0',
                    display: (viewingUser.photoUrl || viewingUser.photoBase64) ? 'none' : 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '64px',
                    color: '#999',
                    margin: '0 auto'
                  }}>
                    👤
                  </div>
                  <p style={{ marginTop: '10px', fontSize: '14px', color: '#666' }}>Profile Photo</p>
                </div>

                {/* User Details */}
                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="stack">
                    <label style={{ fontWeight: 'bold', color: '#666' }}>Name</label>
                    <div style={{ padding: '10px', background: '#f5f5f5', borderRadius: '6px', fontSize: '14px' }}>
                      {viewingUser.name || 'Not provided'}
                    </div>
                  </div>
                  <div className="stack">
                    <label style={{ fontWeight: 'bold', color: '#666' }}>Email</label>
                    <div style={{ padding: '10px', background: '#f5f5f5', borderRadius: '6px', fontSize: '14px' }}>
                      {viewingUser.email || 'Not provided'}
                    </div>
                  </div>
                  <div className="stack">
                    <label style={{ fontWeight: 'bold', color: '#666' }}>Phone</label>
                    <div style={{ padding: '10px', background: '#f5f5f5', borderRadius: '6px', fontSize: '14px' }}>
                      {viewingUser.phone || 'Not provided'}
                    </div>
                  </div>
                  <div className="stack">
                    <label style={{ fontWeight: 'bold', color: '#666' }}>Role</label>
                    <div style={{ padding: '10px', background: '#f5f5f5', borderRadius: '6px', fontSize: '14px' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '4px',
                        backgroundColor: getRoleColor(viewingUser.role),
                        color: 'white',
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}>
                        {viewingUser.role?.toUpperCase() || 'USER'}
                      </span>
                    </div>
                  </div>
                  <div className="stack">
                    <label style={{ fontWeight: 'bold', color: '#666' }}>Status</label>
                    <div style={{ padding: '10px', background: '#f5f5f5', borderRadius: '6px', fontSize: '14px' }}>
                      {getStatusBadge(viewingUser.isActive !== false && viewingUser.is_active !== false)}
                    </div>
                  </div>
                  <div className="stack">
                    <label style={{ fontWeight: 'bold', color: '#666' }}>Language</label>
                    <div style={{ padding: '10px', background: '#f5f5f5', borderRadius: '6px', fontSize: '14px' }}>
                      {viewingUser.language || 'en'}
                    </div>
                  </div>
                </div>

                <div className="stack">
                  <label style={{ fontWeight: 'bold', color: '#666' }}>Region/Location</label>
                  <div style={{ padding: '10px', background: '#f5f5f5', borderRadius: '6px', fontSize: '14px' }}>
                    {viewingUser.region || viewingUser.village ? 
                      `${viewingUser.village || ''}${viewingUser.village && viewingUser.district ? ', ' : ''}${viewingUser.district || ''}${viewingUser.region && !viewingUser.village ? ` - ${viewingUser.region}` : ''}`.trim() || viewingUser.region || 'Not specified' : 
                      'Not specified'}
                  </div>
                </div>

                <div className="stack">
                  <label style={{ fontWeight: 'bold', color: '#666' }}>User ID</label>
                  <div style={{ padding: '10px', background: '#f5f5f5', borderRadius: '6px', fontSize: '12px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    {viewingUser.id}
                  </div>
                </div>

                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="stack">
                    <label style={{ fontWeight: 'bold', color: '#666' }}>Created At</label>
                    <div style={{ padding: '10px', background: '#f5f5f5', borderRadius: '6px', fontSize: '14px' }}>
                      {viewingUser.createdAt ? 
                        new Date(viewingUser.createdAt).toLocaleString() : 
                        'Not available'}
                    </div>
                  </div>
                  <div className="stack">
                    <label style={{ fontWeight: 'bold', color: '#666' }}>Last Active</label>
                    <div style={{ padding: '10px', background: '#f5f5f5', borderRadius: '6px', fontSize: '14px' }}>
                      {viewingUser.lastActive ? 
                        new Date(viewingUser.lastActive).toLocaleString() : 
                        'Never'}
                    </div>
                  </div>
                </div>

                {viewingUser.permissions && viewingUser.permissions.length > 0 && (
                  <div className="stack">
                    <label style={{ fontWeight: 'bold', color: '#666' }}>Permissions</label>
                    <div style={{ padding: '10px', background: '#f5f5f5', borderRadius: '6px', fontSize: '14px' }}>
                      {viewingUser.permissions.map((p, i) => (
                        <span key={i} style={{
                          display: 'inline-block',
                          padding: '4px 8px',
                          margin: '4px',
                          background: '#e3f2fd',
                          borderRadius: '4px',
                          fontSize: '12px'
                        }}>
                          {p.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="row" style={{ gap: '12px', marginTop: '10px' }}>
                  <button 
                    className="btn" 
                    onClick={() => {
                      setViewingUser(null)
                      setEditingUser(viewingUser)
                    }}
                  >
                    ✏️ Edit User
                  </button>
                  <button 
                    className="btn secondary" 
                    onClick={() => setViewingUser(null)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Edit User Modal */}
        {editingUser && (
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
                <h2>✏️ Edit User</h2>
                <button 
                  className="btn secondary" 
                  onClick={() => setEditingUser(null)}
                >
                  ✕ Close
                </button>
              </div>

              <div className="stack" style={{ gap: '16px' }}>
                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="stack">
                    <label>Name</label>
                    <input 
                      className="input" 
                      value={editingUser.name} 
                      onChange={e => setEditingUser(prev => ({ ...prev, name: e.target.value }))}
                    />
                  </div>
                  <div className="stack">
                    <label>Email</label>
                    <input 
                      className="input" 
                      type="email" 
                      value={editingUser.email} 
                      onChange={e => setEditingUser(prev => ({ ...prev, email: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div className="stack">
                    <label>Phone</label>
                    <input 
                      className="input" 
                      type="tel" 
                      value={editingUser.phone || ''} 
                      onChange={e => setEditingUser(prev => ({ ...prev, phone: e.target.value }))}
                    />
                  </div>
                  <div className="stack">
                    <label>Role</label>
                    <select 
                      className="select" 
                      value={editingUser.role} 
                      onChange={e => setEditingUser(prev => ({ ...prev, role: e.target.value }))}
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                </div>


                <div className="stack">
                  <label>Permissions</label>
                  <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px' }}>
                    {getRolePermissions(editingUser.role).map(permission => (
                      <label key={permission} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input 
                          type="checkbox" 
                          checked={editingUser.permissions?.includes(permission) || false}
                          onChange={e => {
                            const permissions = editingUser.permissions || []
                            if (e.target.checked) {
                              setEditingUser(prev => ({ 
                                ...prev, 
                                permissions: [...permissions, permission] 
                              }))
                            } else {
                              setEditingUser(prev => ({ 
                                ...prev, 
                                permissions: permissions.filter(p => p !== permission) 
                              }))
                            }
                          }}
                        />
                        <span style={{ fontSize: '12px' }}>{permission.replace(/_/g, ' ')}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="row" style={{ gap: '12px' }}>
                  <button 
                    className="btn" 
                    onClick={() => handleUpdateUser(editingUser.id, editingUser)}
                  >
                    Update User
                  </button>
                  <button 
                    className="btn secondary" 
                    onClick={() => setEditingUser(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

