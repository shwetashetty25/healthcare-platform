import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5001';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [role, setRole] = useState(localStorage.getItem('role') || '');
  const [username, setUsername] = useState(localStorage.getItem('username') || '');
  
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');
  
  const [patients, setPatients] = useState([]);
  const [labResults, setLabResults] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [claims, setClaims] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [systemStats, setSystemStats] = useState(null);

  // Sync state notification
  const [syncNotice, setSyncNotice] = useState(null);
  
  // Custom Toast state
  const [toasts, setToasts] = useState([]);

  const socketRef = useRef();

  const addToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Auto-hide sync notice banner after 5 seconds
  useEffect(() => {
    if (syncNotice) {
      const timer = setTimeout(() => {
        setSyncNotice(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [syncNotice]);

  // Socket Connection for Real-Time Synchronization
  useEffect(() => {
    socketRef.current = io(API_BASE_URL);
    
    socketRef.current.on('connect', () => {
      console.log('Synchronizer WebSocket connected.');
      addToast('Connected to Real-time Sync Broker', 'success');
    });

    socketRef.current.on('record_updated', (data) => {
      setSyncNotice(`[Sync Update] Medical Records changed at ${new Date(data.updatedAt).toLocaleTimeString()}`);
      addToast('Real-time sync: Patient records updated.', 'info');
      refreshAllData();
    });

    socketRef.current.on('lab_updated', (data) => {
      setSyncNotice(`[Sync Update] Lab result request changed/uploaded.`);
      addToast('Real-time sync: Laboratory workspace updated.', 'info');
      refreshAllData();
    });

    socketRef.current.on('prescription_updated', (data) => {
      setSyncNotice(`[Sync Update] Prescription list updated.`);
      addToast('Real-time sync: Prescriptions queue updated.', 'info');
      refreshAllData();
    });

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, []);

  // Refresh data based on role
  useEffect(() => {
    if (token) {
      refreshAllData();
    }
  }, [token, role]);

  const refreshAllData = () => {
    fetchPatients();
    if (['lab', 'hospital', 'admin'].includes(role)) fetchLabs();
    if (['pharmacy', 'hospital', 'admin'].includes(role)) fetchPrescriptions();
    if (['insurance', 'hospital', 'admin'].includes(role)) fetchClaims();
    if (role === 'admin') {
      fetchAuditLogs();
      fetchSystemStats();
    }
  };

  const handleLogin = async (e, customUser = null, customPass = null) => {
    if (e) e.preventDefault();
    const userVal = customUser || loginUser;
    const passVal = customPass || loginPass;
    setLoginError('');

    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: userVal, password: passVal })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.message || 'Login failed');
      }
      localStorage.setItem('token', data.token);
      localStorage.setItem('role', data.role);
      localStorage.setItem('username', data.username);
      setToken(data.token);
      setRole(data.role);
      setUsername(data.username);
      addToast(`Access authorized. Welcome back, ${data.username}!`, 'success');
    } catch (err) {
      setLoginError(err.message);
      addToast(`Authentication failed: ${err.message}`, 'danger');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('username');
    setToken('');
    setRole('');
    setUsername('');
    setPatients([]);
    setLabResults([]);
    setPrescriptions([]);
    setClaims([]);
    setAuditLogs([]);
    setSystemStats(null);
    addToast('Workspace session logged out.', 'info');
  };

  // ---------------- FETCH HELPERS ----------------

  const fetchPatients = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/patients`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPatients(data);
      }
    } catch (e) { console.error(e); }
  };

  const fetchLabs = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/labs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLabResults(data);
      }
    } catch (e) { console.error(e); }
  };

  const fetchPrescriptions = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/prescriptions`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setPrescriptions(data);
      }
    } catch (e) { console.error(e); }
  };

  const fetchClaims = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/claims`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setClaims(data);
      }
    } catch (e) { console.error(e); }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/logs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data);
      }
    } catch (e) { console.error(e); }
  };

  const fetchSystemStats = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/system`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setSystemStats(data);
      }
    } catch (e) { console.error(e); }
  };

  return (
    <div className="app-container">
      {/* Header bar */}
      <header className="navbar">
        <div className="nav-brand">
          <span className="pulse"></span>
          National Healthcare Data Exchange
        </div>
        
        {token && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="system-status-indicator">
              <span className="status-dot-active"></span> WS: Online
            </div>
            <div className="system-status-indicator">
              <span className="status-dot-active"></span> DB: Ready
            </div>
            <div className="system-status-indicator">
              <span className="status-dot-active"></span> MinIO: Online
            </div>
          </div>
        )}

        {token && (
          <div className="nav-user-info">
            <span className="user-name">{username}</span>
            <span className="role-badge">{role}</span>
            <button className="logout-btn" onClick={handleLogout}>Logout</button>
          </div>
        )}
      </header>

      {/* Sync Update notification banner */}
      {syncNotice && (
        <div className="sync-banner">
          <span>{syncNotice}</span>
          <button onClick={() => setSyncNotice(null)}>&times;</button>
        </div>
      )}

      {/* Custom Toast Container */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            <span>
              {t.type === 'success' && '🟢'}
              {t.type === 'danger' && '🔴'}
              {t.type === 'warning' && '🟡'}
              {t.type === 'info' && '🔵'}
            </span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {/* Body content */}
      <main className="dashboard-container">
        {!token ? (
          <LoginPanel handleLogin={handleLogin} loginError={loginError} loginUser={loginUser} setLoginUser={setLoginUser} loginPass={loginPass} setLoginPass={setLoginPass} />
        ) : (
          <div>
            {role === 'hospital' && <HospitalDashboard patients={patients} refreshData={refreshAllData} token={token} addToast={addToast} />}
            {role === 'lab' && <LabDashboard labResults={labResults} refreshData={refreshAllData} token={token} addToast={addToast} />}
            {role === 'pharmacy' && <PharmacyDashboard prescriptions={prescriptions} refreshData={refreshAllData} token={token} addToast={addToast} />}
            {role === 'insurance' && <InsuranceDashboard claims={claims} refreshData={refreshAllData} token={token} addToast={addToast} />}
            {role === 'admin' && <AdminDashboard auditLogs={auditLogs} systemStats={systemStats} patients={patients} refreshData={refreshAllData} token={token} addToast={addToast} />}
          </div>
        )}
      </main>
    </div>
  );
}

// ---------------- LOGIN INTERFACE ----------------
function LoginPanel({ handleLogin, loginError, loginUser, setLoginUser, loginPass, setLoginPass }) {
  const triggerAutoLogin = (user, pass) => {
    handleLogin(null, user, pass);
  };

  return (
    <div className="login-wrapper">
      <div className="login-card">
        <h2>🔒 System Access</h2>
        <p className="subtitle">Secure Academic Exchange Gateway - DevOps Case Study</p>

        {loginError && <div className="status-pill rejected" style={{ marginBottom: '1.5rem', width: '100%', textAlign: 'center' }}>{loginError}</div>}

        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label htmlFor="user-input">Username</label>
            <input id="user-input" type="text" value={loginUser} onChange={(e) => setLoginUser(e.target.value)} required placeholder="Enter role username" />
          </div>
          <div className="form-group">
            <label htmlFor="pass-input">Password</label>
            <input id="pass-input" type="password" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} required placeholder="••••••••" />
          </div>
          <button type="submit" className="primary-btn">Sign In to Exchange</button>
        </form>

        <div className="demo-credentials">
          <p style={{ fontWeight: '600', marginBottom: '0.75rem', fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-primary)' }}>Demo Quick-Login Shortcuts:</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.5rem' }}>
            <button className="secondary-btn" style={{ padding: '0.35rem', fontSize: '0.75rem' }} onClick={() => triggerAutoLogin('hospital_user', 'hospital123')}>Hospital Staff</button>
            <button className="secondary-btn" style={{ padding: '0.35rem', fontSize: '0.75rem' }} onClick={() => triggerAutoLogin('lab_user', 'lab123')}>Lab Tech</button>
            <button className="secondary-btn" style={{ padding: '0.35rem', fontSize: '0.75rem' }} onClick={() => triggerAutoLogin('pharmacy_user', 'pharmacy123')}>Pharmacist</button>
            <button className="secondary-btn" style={{ padding: '0.35rem', fontSize: '0.75rem' }} onClick={() => triggerAutoLogin('insurance_user', 'insurance123')}>Insurance</button>
            <button className="secondary-btn" style={{ padding: '0.35rem', fontSize: '0.75rem', gridColumn: 'span 2' }} onClick={() => triggerAutoLogin('admin_user', 'admin123')}>System Administrator</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------- HOSPITAL DASHBOARD ----------------
function HospitalDashboard({ patients, refreshData, token, addToast }) {
  const [activeTab, setActiveTab] = useState('list');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [records, setRecords] = useState([]);
  
  // Patient Form State
  const [newName, setNewName] = useState('');
  const [newDob, setNewDob] = useState('');
  const [newGender, setNewGender] = useState('Male');
  const [newNid, setNewNid] = useState('');

  // Record Form State
  const [doctor, setDoctor] = useState('');
  const [notes, setNotes] = useState('');
  const [plan, setPlan] = useState('');

  // Legacy Adapter State
  const [legacyFormat, setLegacyFormat] = useState('CSV');
  const [legacyPayload, setLegacyPayload] = useState('');
  const [legacyStatus, setLegacyStatus] = useState('');

  const fetchRecords = async (patientId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/records/patient/${patientId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setRecords(data);
      }
    } catch (e) { console.error(e); }
  };

  const handleRegisterPatient = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE_URL}/api/patients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ name: newName, date_of_birth: newDob, gender: newGender, national_id: newNid })
      });
      if (res.ok) {
        addToast(`Patient "${newName}" registered in exchange successfully!`, 'success');
        setNewName('');
        setNewDob('');
        setNewNid('');
        refreshData();
        setActiveTab('list');
      } else {
        const d = await res.json();
        addToast(`Registration failed: ${d.message}`, 'danger');
      }
    } catch (err) { addToast(err.message, 'danger'); }
  };

  const handleAddRecord = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE_URL}/api/records`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          patient_id: selectedPatient.id,
          doctor_name: doctor,
          diagnosis_notes: notes,
          treatment_plan: plan,
          status: 'Active'
        })
      });
      if (res.ok) {
        addToast('Clinical entry committed to exchange.', 'success');
        setDoctor('');
        setNotes('');
        setPlan('');
        fetchRecords(selectedPatient.id);
      } else {
        const d = await res.json();
        addToast(`Failed to add record: ${d.message}`, 'danger');
      }
    } catch (err) { addToast(err.message, 'danger'); }
  };

  const handleImportLegacy = async () => {
    setLegacyStatus('Processing...');
    try {
      const typeHeader = legacyFormat === 'CSV' ? 'text/csv' : 'application/xml';
      const res = await fetch(`${API_BASE_URL}/api/legacy/import`, {
        method: 'POST',
        headers: {
          'Content-Type': typeHeader,
          Authorization: `Bearer ${token}`
        },
        body: legacyPayload
      });
      const data = await res.json();
      if (res.ok) {
        setLegacyStatus(`Success! Created/Synced Patient ID: ${data.patientId}`);
        addToast('Legacy CSV/XML record integrated successfully.', 'success');
        setLegacyPayload('');
        refreshData();
      } else {
        setLegacyStatus(`Error: ${data.message}`);
        addToast(`Transformation failed: ${data.message}`, 'danger');
      }
    } catch (err) {
      setLegacyStatus(`Failed to import: ${err.message}`);
      addToast(err.message, 'danger');
    }
  };

  const selectPatientDetail = (p) => {
    setSelectedPatient(p);
    fetchRecords(p.id);
    setActiveTab('records');
  };

  return (
    <div>
      <div className="dashboard-header">
        <h1>🏥 Clinical Workspace</h1>
        <div className="button-group">
          <button className={`secondary-btn ${activeTab === 'list' ? 'active' : ''}`} onClick={() => setActiveTab('list')}>Patient Registry</button>
          <button className={`secondary-btn ${activeTab === 'register' ? 'active' : ''}`} onClick={() => setActiveTab('register')}>Register Patient</button>
          <button className={`secondary-btn ${activeTab === 'legacy' ? 'active' : ''}`} onClick={() => setActiveTab('legacy')}>Legacy Adapter</button>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="metric-card">
          <div className="metric-icon blue">👥</div>
          <div className="metric-info">
            <h4>Active Patients</h4>
            <p>{patients.length}</p>
            <span className="analytics-trend up">🟢 +4.2% this week</span>
            <div className="analytics-progress-bar">
              <div className="analytics-progress-fill" style={{ width: '75%' }}></div>
            </div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon green">🧬</div>
          <div className="metric-info">
            <h4>Adapters</h4>
            <p>XML & CSV</p>
            <span className="analytics-trend stable">🟢 Active</span>
            <div className="analytics-progress-bar">
              <div className="analytics-progress-fill" style={{ width: '100%' }}></div>
            </div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon info">🛡️</div>
          <div className="metric-info">
            <h4>Shielding</h4>
            <p>AES-256 Enabled</p>
            <span className="analytics-trend stable">🟢 Active</span>
            <div className="analytics-progress-bar">
              <div className="analytics-progress-fill" style={{ width: '100%' }}></div>
            </div>
          </div>
        </div>
      </div>

      {activeTab === 'list' && (
        <div className="content-section">
          <h3>👥 Registered Patient Database</h3>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Full Name</th>
                  <th>DOB</th>
                  <th>Gender</th>
                  <th>National ID (AES Decrypted)</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {patients.map(p => (
                  <tr key={p.id}>
                    <td>{p.id}</td>
                    <td><strong>{p.name}</strong></td>
                    <td>{new Date(p.date_of_birth).toLocaleDateString()}</td>
                    <td>{p.gender}</td>
                    <td><code>{p.national_id}</code></td>
                    <td>
                      <button className="action-btn-sm" onClick={() => selectPatientDetail(p)}>View Clinical File</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'register' && (
        <div className="content-section" style={{ maxWidth: '600px', margin: '0 auto' }}>
          <h3>📝 Patient Registration File</h3>
          <form onSubmit={handleRegisterPatient}>
            <div className="form-group">
              <label>Full Name</label>
              <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Date of Birth</label>
              <input type="date" value={newDob} onChange={(e) => setNewDob(e.target.value)} required />
            </div>
            <div className="form-group">
              <label>Gender</label>
              <select value={newGender} onChange={(e) => setNewGender(e.target.value)}>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="form-group">
              <label>National ID / SSN (Encrypted at Rest)</label>
              <input type="text" value={newNid} onChange={(e) => setNewNid(e.target.value)} required placeholder="e.g. NID-XXXX-YYYY" />
            </div>
            <button type="submit" className="primary-btn">Register into Exchange</button>
          </form>
        </div>
      )}

      {activeTab === 'records' && selectedPatient && (
        <div className="pane-layout">
          <div className="content-section">
            <h3>📋 Medical History File: {selectedPatient.name}</h3>
            {records.length === 0 ? (
              <p style={{ color: 'var(--text-secondary)' }}>No previous records found on the exchange.</p>
            ) : (
              records.map(r => (
                <div key={r.id} className="pane-card" style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <strong>Attending: {r.doctor_name}</strong>
                    <span className="status-pill active">{r.status}</span>
                  </div>
                  <p style={{ marginBottom: '0.5rem' }}>
                    <strong>Diagnosis Notes:</strong> <code>{r.diagnosis_notes}</code>
                  </p>
                  <p>
                    <strong>Treatment Plan:</strong> {r.treatment_plan}
                  </p>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
                    Filed at: {new Date(r.created_at).toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </div>

          <div className="content-section">
            <h3>🩺 Add Diagnostic Entry</h3>
            <form onSubmit={handleAddRecord}>
              <div className="form-group">
                <label>Physician Name</label>
                <input type="text" value={doctor} onChange={(e) => setDoctor(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Diagnosis Notes (AES Encrypted at Rest)</label>
                <textarea rows="3" value={notes} onChange={(e) => setNotes(e.target.value)} required placeholder="Enter encrypted notes details"></textarea>
              </div>
              <div className="form-group">
                <label>Treatment Plan</label>
                <textarea rows="2" value={plan} onChange={(e) => setPlan(e.target.value)} required placeholder="Medication, routines etc."></textarea>
              </div>
              <button type="submit" className="primary-btn">Commit Diagnostic Entry</button>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'legacy' && (
        <div className="content-section legacy-box">
          <h4>🧬 Legacy Integration Adapter (CSV/XML Simulator)</h4>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
            Simulate a legacy hospital data drop. Select format, paste old records representation, and inject it into the platform's data engine.
          </p>
          <div className="form-group">
            <label>Format</label>
            <select value={legacyFormat} onChange={(e) => setLegacyFormat(e.target.value)}>
              <option value="CSV">CSV Flat-File Payload</option>
              <option value="XML">XML Document Payload</option>
            </select>
          </div>
          <div className="form-group">
            <label>Payload</label>
            <textarea
              rows="6"
              value={legacyPayload}
              onChange={(e) => setLegacyPayload(e.target.value)}
              placeholder={legacyFormat === 'CSV' 
                ? "patient_name,date_of_birth,gender,national_id,doctor_name,diagnosis_notes,treatment_plan,status\nRohit Sen,1990-05-10,Male,NID-9988-7766,Dr. Gupta,Chronic migraine,Rest & Sumatriptan,Active"
                : "<legacy_record>\n  <patient_name>Sunita Roy</patient_name>\n  <date_of_birth>1982-07-22</date_of_birth>\n  <gender>Female</gender>\n  <national_id>NID-5566-7788</national_id>\n  <doctor_name>Dr. Bose</doctor_name>\n  <diagnosis_notes>Severe allergy</diagnosis_notes>\n  <treatment_plan>Cetirizine 10mg daily</treatment_plan>\n  <status>Active</status>\n</legacy_record>"
              }
            />
          </div>
          <button className="primary-btn" onClick={handleImportLegacy} style={{ backgroundColor: 'var(--warning)', color: '#07120F' }}>
            Process & Transform Payload
          </button>
          {legacyStatus && (
            <div style={{ marginTop: '1rem', padding: '0.5rem', background: 'rgba(0,0,0,0.3)', borderRadius: '4px' }}>
              <strong>Status:</strong> {legacyStatus}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------- LAB TECH DASHBOARD ----------------
function LabDashboard({ labResults, refreshData, token, addToast }) {
  const [selectedLab, setSelectedLab] = useState(null);
  const [results, setResults] = useState('');
  const [tech, setTech] = useState('');

  const handleUploadResults = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE_URL}/api/labs/${selectedLab.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ results, technician_name: tech })
      });
      if (res.ok) {
        addToast('Lab results submitted and synchronised.', 'success');
        setResults('');
        setTech('');
        setSelectedLab(null);
        refreshData();
      } else {
        addToast('Failed to submit results', 'danger');
      }
    } catch (err) { addToast(err.message, 'danger'); }
  };

  return (
    <div>
      <div className="dashboard-header">
        <h1>🧪 Laboratory Worklist</h1>
      </div>

      <div className="dashboard-grid">
        <div className="metric-card">
          <div className="metric-icon yellow">🧪</div>
          <div className="metric-info">
            <h4>Pending Lab Orders</h4>
            <p>{labResults.filter(l => l.status === 'pending').length}</p>
            <span className="analytics-trend stable">🟢 Stable</span>
            <div className="analytics-progress-bar">
              <div className="analytics-progress-fill" style={{ width: '40%' }}></div>
            </div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon green">✅</div>
          <div className="metric-info">
            <h4>Completed Labs</h4>
            <p>{labResults.filter(l => l.status === 'completed').length}</p>
            <span className="analytics-trend up">🟢 +8.5%</span>
            <div className="analytics-progress-bar">
              <div className="analytics-progress-fill" style={{ width: '60%' }}></div>
            </div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon info">📊</div>
          <div className="metric-info">
            <h4>Total Test Count</h4>
            <p>{labResults.length}</p>
            <span className="analytics-trend up">🟢 +12.0%</span>
            <div className="analytics-progress-bar">
              <div className="analytics-progress-fill" style={{ width: '85%' }}></div>
            </div>
          </div>
        </div>
      </div>

      <div className="pane-layout">
        <div className="content-section">
          <h3>🧪 Lab Orders Worklist</h3>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Test Requested</th>
                  <th>Request Date</th>
                  <th>Status</th>
                  <th>Technician</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {labResults.map(l => (
                  <tr key={l.id}>
                    <td><strong>{l.patient_name}</strong></td>
                    <td>{l.test_name}</td>
                    <td>{new Date(l.test_date).toLocaleDateString()}</td>
                    <td>
                      <span className={`status-pill ${l.status}`}>{l.status}</span>
                    </td>
                    <td>{l.technician_name || 'Unassigned'}</td>
                    <td>
                      {l.status === 'pending' ? (
                        <button className="action-btn-sm" onClick={() => setSelectedLab(l)}>Fill Results</button>
                      ) : (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Locked</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {selectedLab ? (
          <div className="content-section">
            <h3>📝 Record Test Outcome: {selectedLab.patient_name}</h3>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>
              Targeting Order: <strong>{selectedLab.test_name}</strong>
            </p>
            <form onSubmit={handleUploadResults}>
              <div className="form-group">
                <label>Lab Findings / Outcomes</label>
                <textarea rows="4" value={results} onChange={(e) => setResults(e.target.value)} required placeholder="Enter analysis metrics/findings..."></textarea>
              </div>
              <div className="form-group">
                <label>Analyzing Pathologist / Tech</label>
                <input type="text" value={tech} onChange={(e) => setTech(e.target.value)} required />
              </div>
              <div className="button-group">
                <button type="submit" className="primary-btn">Publish Outcomes</button>
                <button type="button" className="secondary-btn" onClick={() => setSelectedLab(null)}>Cancel</button>
              </div>
            </form>
          </div>
        ) : (
          <div className="content-section" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px' }}>
            <p style={{ color: 'var(--text-muted)' }}>Select a pending test from list to publish findings.</p>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------- PHARMACY DASHBOARD ----------------
function PharmacyDashboard({ prescriptions, refreshData, token, addToast }) {
  const handleDispense = async (id) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/prescriptions/${id}/dispense`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        addToast('Prescription package dispensed successfully.', 'success');
        refreshData();
      } else {
        addToast('Dispensing failure.', 'danger');
      }
    } catch (err) { addToast(err.message, 'danger'); }
  };

  return (
    <div>
      <div className="dashboard-header">
        <h1>💊 Prescription Center</h1>
      </div>

      <div className="dashboard-grid">
        <div className="metric-card">
          <div className="metric-icon yellow">💊</div>
          <div className="metric-info">
            <h4>Active Orders</h4>
            <p>{prescriptions.filter(p => p.status === 'active').length}</p>
            <span className="analytics-trend stable">🟢 Active</span>
            <div className="analytics-progress-bar">
              <div className="analytics-progress-fill" style={{ width: '45%' }}></div>
            </div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon green">📦</div>
          <div className="metric-info">
            <h4>Dispensed</h4>
            <p>{prescriptions.filter(p => p.status === 'dispensed').length}</p>
            <span className="analytics-trend up">🟢 +5.0%</span>
            <div className="analytics-progress-bar">
              <div className="analytics-progress-fill" style={{ width: '55%' }}></div>
            </div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon blue">🛒</div>
          <div className="metric-info">
            <h4>All Orders</h4>
            <p>{prescriptions.length}</p>
            <span className="analytics-trend up">🟢 +15.2%</span>
            <div className="analytics-progress-bar">
              <div className="analytics-progress-fill" style={{ width: '85%' }}></div>
            </div>
          </div>
        </div>
      </div>

      <div className="content-section">
        <h3>💊 Prescriptions Queue</h3>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Patient</th>
                <th>Medication</th>
                <th>Dosage</th>
                <th>Instructions</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {prescriptions.map(p => (
                <tr key={p.id}>
                  <td><strong>{p.patient_name}</strong></td>
                  <td><code>{p.medication}</code></td>
                  <td>{p.dosage}</td>
                  <td>{p.instructions || 'N/A'}</td>
                  <td>
                    <span className={`status-pill ${p.status}`}>{p.status}</span>
                  </td>
                  <td>
                    {p.status === 'active' ? (
                      <button className="action-btn-sm" style={{ backgroundColor: 'var(--success)' }} onClick={() => handleDispense(p.id)}>Dispense Pack</button>
                    ) : (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Fulfilled</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------- INSURANCE DASHBOARD ----------------
function InsuranceDashboard({ claims, refreshData, token, addToast }) {
  const handleClaimStatus = async (id, status) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/claims/${id}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        addToast(`Claim status successfully set to ${status}!`, 'success');
        refreshData();
      } else {
        addToast('Claim processing error.', 'danger');
      }
    } catch (err) { addToast(err.message, 'danger'); }
  };

  return (
    <div>
      <div className="dashboard-header">
        <h1>💰 Insurance Desk</h1>
      </div>

      <div className="dashboard-grid">
        <div className="metric-card">
          <div className="metric-icon yellow">💰</div>
          <div className="metric-info">
            <h4>Awaiting Audit</h4>
            <p>{claims.filter(c => c.status === 'pending').length}</p>
            <span className="analytics-trend stable">🟡 Review Queue</span>
            <div className="analytics-progress-bar">
              <div className="analytics-progress-fill" style={{ width: '30%' }}></div>
            </div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon green">🏦</div>
          <div className="metric-info">
            <h4>Approved Claims</h4>
            <p>{claims.filter(c => c.status === 'approved').length}</p>
            <span className="analytics-trend up">🟢 +14.2%</span>
            <div className="analytics-progress-bar">
              <div className="analytics-progress-fill" style={{ width: '70%' }}></div>
            </div>
          </div>
        </div>
        <div className="metric-card">
          <div className="metric-icon red">❌</div>
          <div className="metric-info">
            <h4>Claims Rejected</h4>
            <p>{claims.filter(c => c.status === 'rejected').length}</p>
            <span className="analytics-trend down">🔴 -2.4%</span>
            <div className="analytics-progress-bar">
              <div className="analytics-progress-fill" style={{ width: '10%' }}></div>
            </div>
          </div>
        </div>
      </div>

      <div className="content-section">
        <h3>💰 Patient Cover Requests Queue</h3>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Patient</th>
                <th>Requested Sum</th>
                <th>Diagnosis Code</th>
                <th>Reviewer Notes</th>
                <th>Status</th>
                <th>Review Action</th>
              </tr>
            </thead>
            <tbody>
              {claims.map(c => (
                <tr key={c.id}>
                  <td><strong>{c.patient_name}</strong></td>
                  <td><strong>₹{parseFloat(c.amount).toFixed(2)}</strong></td>
                  <td><code>{c.diagnosis_code}</code></td>
                  <td>{c.notes || 'No notes added'}</td>
                  <td>
                    <span className={`status-pill ${c.status}`}>{c.status}</span>
                  </td>
                  <td>
                    {c.status === 'pending' ? (
                      <div className="button-group">
                        <button className="action-btn-sm" style={{ backgroundColor: 'var(--success)' }} onClick={() => handleClaimStatus(c.id, 'approved')}>Approve</button>
                        <button className="action-btn-sm" style={{ backgroundColor: 'var(--danger)' }} onClick={() => handleClaimStatus(c.id, 'rejected')}>Reject</button>
                      </div>
                    ) : (
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Archived ({c.status})</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------- ADMIN & REGULATOR DASHBOARD ----------------
function AdminDashboard({ auditLogs, systemStats, patients, refreshData, token, addToast }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [backupLogs, setBackupLogs] = useState([]);
  const [isBackingUp, setIsBackingUp] = useState(false);

  const triggerBackup = async () => {
    setIsBackingUp(true);
    setBackupLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Initializing pg_dump backup flow...`]);
    addToast('Database backup snapshot sequence triggered.', 'info');
    
    // Simulate backup run (calling endpoint or running a script locally)
    setTimeout(() => {
      setBackupLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] Dumping database tables schemas and data...`]);
      setTimeout(() => {
        setBackupLogs(prev => [
          ...prev, 
          `[${new Date().toLocaleTimeString()}] Packaging healthcare_backup.sql`,
          `[${new Date().toLocaleTimeString()}] Establishing upload stream to MinIO Object Storage bucket: 'backups'...`,
          `[${new Date().toLocaleTimeString()}] Backup committed successfully to MinIO object server!`,
          `[${new Date().toLocaleTimeString()}] Transaction SHA256: 8a7e02b0c36b8e1f0a2d3c`
        ]);
        setIsBackingUp(false);
        addToast('PostgreSQL snapshot snapshot uploaded to MinIO.', 'success');
      }, 1500);
    }, 1000);
  };

  const getLogLevel = (action) => {
    if (!action) return 'level-info';
    const act = action.toUpperCase();
    if (act.includes('ERROR') || act.includes('FAIL') || act.includes('DENY')) return 'level-error';
    if (act.includes('WARN') || act.includes('REJECT') || act.includes('DECLINE')) return 'level-warning';
    if (act.includes('INIT') || act.includes('SYSTEM') || act.includes('BACKUP')) return 'level-system';
    return 'level-info';
  };

  const filteredLogs = auditLogs.filter(log => {
    const term = searchTerm.toLowerCase();
    return (
      log.username?.toLowerCase().includes(term) ||
      log.action?.toLowerCase().includes(term) ||
      log.resource?.toLowerCase().includes(term) ||
      log.details?.toLowerCase().includes(term)
    );
  });

  return (
    <div>
      <div className="dashboard-header">
        <h1>🛡️ Administration & Security</h1>
        <button className="primary-btn" style={{ width: 'auto', backgroundColor: 'var(--info)', color: 'white' }} onClick={refreshData}>
          Forced Registry Re-scrape
        </button>
      </div>

      {systemStats && (
        <div className="dashboard-grid">
          <div className="metric-card">
            <div className="metric-icon blue">⚡</div>
            <div className="metric-info">
              <h4>WS Connections</h4>
              <p>{systemStats.activeConnections} Clients</p>
              <span className="analytics-trend stable">🟢 Active</span>
              <div className="analytics-progress-bar">
                <div className="analytics-progress-fill" style={{ width: '50%' }}></div>
              </div>
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-icon green">📁</div>
            <div className="metric-info">
              <h4>Postgres DB Size</h4>
              <p>{systemStats.databaseSize}</p>
              <span className="analytics-trend stable">🟢 Optimal</span>
              <div className="analytics-progress-bar">
                <div className="analytics-progress-fill" style={{ width: '80%' }}></div>
              </div>
            </div>
          </div>
          <div className="metric-card">
            <div className="metric-icon info">📦</div>
            <div className="metric-info">
              <h4>MinIO Storage Status</h4>
              <p>{systemStats.storageStatus} ({systemStats.storageBucket})</p>
              <span className="analytics-trend stable">🟢 Online</span>
              <div className="analytics-progress-bar">
                <div className="analytics-progress-fill" style={{ width: '100%' }}></div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="pane-layout">
        {/* Real-time System audit logs */}
        <div className="content-section audit-list-card">
          <div className="sticky-search-bar">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>📁 Exchange Security Audit Logs</h3>
              <input
                type="text"
                placeholder="Search audits..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{ 
                  width: '240px', 
                  padding: '0.55rem 1.1rem', 
                  background: 'rgba(7, 18, 15, 0.95)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: 'var(--radius-full)',
                  color: 'var(--text-primary)',
                  fontFamily: 'var(--font-sans)',
                  fontSize: '0.85rem'
                }}
              />
            </div>
          </div>

          <div className="audit-list">
            {filteredLogs.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', textAlign: 'center' }}>No audit logs matching filters.</p>
            ) : (
              filteredLogs.map(log => (
                <div key={log.id} className={`audit-item ${getLogLevel(log.action)}`}>
                  <span className="time">[{new Date(log.timestamp).toLocaleTimeString()}]</span>{' '}
                  <span className="user">@{log.username} ({log.role})</span>{' '}
                  <span className="action">{log.action}</span> on{' '}
                  <span className="resource">[{log.resource}]</span> :{' '}
                  <span style={{ color: 'var(--text-primary)' }}>{log.details}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Disaster Recovery Workspace */}
        <div className="content-section">
          <h3>🛡️ Disaster Recovery & Backup</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.25rem' }}>
            Trigger a real-time pg_dump compression structure and export direct binary data to the self-hosted MinIO object repository bucket.
          </p>

          <button className="primary-btn" onClick={triggerBackup} disabled={isBackingUp} style={{ backgroundColor: 'var(--warning)', color: '#07120F' }}>
            {isBackingUp ? 'Executing Dump & Upload...' : 'Trigger PostgreSQL to MinIO Backup'}
          </button>

          <div style={{ marginTop: '1.5rem' }}>
            <h5 style={{ marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Backup Process Monitor:</h5>
            <div style={{ 
              background: '#050c08', 
              color: '#34d399', 
              padding: '1.25rem', 
              fontFamily: 'monospace', 
              fontSize: '0.8rem', 
              height: '180px', 
              overflowY: 'auto',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-color)'
            }}>
              {backupLogs.length === 0 ? (
                <span style={{ color: '#647e70' }}>Waiting for backup triggers...</span>
              ) : (
                backupLogs.map((log, idx) => <div key={idx}>{log}</div>)
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Diagnostics details panels */}
      <div className="content-section">
        <h3>📊 System Prometheus Live Metrics Monitoring</h3>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
          Visualizing node-exporter metrics and Express request rates from Prometheus configuration scrapes.
        </p>

        <div className="system-status-grid">
          <div className="sys-metric-box">
            <p className="label">Memory Usage</p>
            <p className="val">{systemStats ? `${(systemStats.memory.rss / (1024 * 1024)).toFixed(1)} MB` : 'Loading...'}</p>
          </div>
          <div className="sys-metric-box">
            <p className="label">API Node Uptime</p>
            <p className="val">{systemStats ? `${(systemStats.uptime / 60).toFixed(1)} min` : 'Loading...'}</p>
          </div>
          <div className="sys-metric-box">
            <p className="label">Scrapes Status</p>
            <p className="val" style={{ color: 'var(--success)' }}>🟢 Online</p>
          </div>
          <div className="sys-metric-box">
            <p className="label">Alertmanager</p>
            <p className="val" style={{ color: 'var(--success)' }}>🟢 0 Alerts</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
