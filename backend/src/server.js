const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const client = require('prom-client');
require('dotenv').config();

const { pool, initDb } = require('./db/db');
const { encrypt, decrypt } = require('./utils/encryption');
const { generateToken, authenticateToken, authorizeRoles } = require('./middleware/auth');
const { logAudit, auditAction } = require('./middleware/audit');
const legacyRouter = require('./routes/legacy');

// Initialize Express, HTTP, Socket.io
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
  }
});
app.set('socketio', io);

// Body Parsers & CORS
app.use(cors());
app.use(express.json());
// Support raw text/csv/xml parsing on legacy endpoint
app.use('/api/legacy', express.text({ type: ['text/csv', 'application/xml', 'text/xml', 'text/plain'] }));

// Prometheus Metrics Setup
const register = client.register;
client.collectDefaultMetrics({ register });

const httpRequestsTotal = new client.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

const httpRequestDurationSeconds = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.3, 0.5, 1.0, 2.0, 5.0],
});

// Prometheus monitoring middleware
app.use((req, res, next) => {
  const start = process.hrtime();
  res.on('finish', () => {
    const duration = process.hrtime(start);
    const durationInSeconds = duration[0] + duration[1] / 1e9;
    const route = req.route ? req.route.path : req.path;
    httpRequestsTotal.inc({ method: req.method, route, status_code: res.statusCode });
    httpRequestDurationSeconds.observe({ method: req.method, route, status_code: res.statusCode }, durationInSeconds);
  });
  next();
});

// Vault Integration Setup
const VAULT_ADDR = process.env.VAULT_ADDR || 'http://127.0.0.1:8200';
const VAULT_TOKEN = process.env.VAULT_TOKEN || 'root';
const vault = require('node-vault')({
  apiVersion: 'v1',
  endpoint: VAULT_ADDR,
  token: VAULT_TOKEN
});

async function loadSecrets() {
  try {
    console.log(`Connecting to Vault at ${VAULT_ADDR}...`);
    const vaultRes = await vault.read('secret/data/healthcare');
    if (vaultRes && vaultRes.data && vaultRes.data.data) {
      console.log('Secrets fetched from HashiCorp Vault.');
      const creds = vaultRes.data.data;
      if (creds.db_user) process.env.DB_USER = creds.db_user;
      if (creds.db_password) process.env.DB_PASSWORD = creds.db_password;
      if (creds.jwt_secret) process.env.JWT_SECRET = creds.jwt_secret;
    }
  } catch (err) {
    console.log(`Vault config skipped or unavailable (${err.message}). Falling back to environment configurations.`);
  }
}

// ---------------- API ENDPOINTS ----------------

// Public Metrics
app.get('/metrics', async (req, res) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// Authentication
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required' });
  }

  try {
    const userRes = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (userRes.rows.length === 0) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const user = userRes.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid username or password' });
    }

    const token = generateToken(user);
    
    // Log audit
    logAudit({ user }, 'USER_LOGIN', 'users', `User login successful: ${username}`);

    return res.json({ token, role: user.role, username: user.username });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Verify Current Token User Details
app.get('/api/auth/me', authenticateToken, (req, res) => {
  res.json({ username: req.user.username, role: req.user.role, id: req.user.id });
});

// Legacy import routing hook
app.use('/api/legacy', legacyRouter);

// Patients Management
app.get('/api/patients', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM patients ORDER BY name ASC');
    
    // Decrypt sensitive National ID ONLY for Hospital Staff and Admins
    const processed = result.rows.map(patient => {
      const p = { ...patient };
      if (['hospital', 'admin'].includes(req.user.role)) {
        p.national_id = decrypt(p.encrypted_national_id);
      } else {
        p.national_id = '***-***-**** (Authorized Role Required)';
      }
      delete p.encrypted_national_id;
      return p;
    });

    return res.json(processed);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/patients', authenticateToken, authorizeRoles('hospital', 'admin'), auditAction('CREATE_PATIENT', 'patients'), async (req, res) => {
  const { name, date_of_birth, gender, national_id } = req.body;
  if (!name || !date_of_birth || !gender || !national_id) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    const encryptedNid = encrypt(national_id);
    const result = await pool.query(
      `INSERT INTO patients (name, date_of_birth, gender, encrypted_national_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name, date_of_birth, gender, encryptedNid]
    );

    const newPatient = result.rows[0];
    newPatient.national_id = national_id;
    delete newPatient.encrypted_national_id;

    // Real-time broadcast notification
    io.emit('record_updated', {
      type: 'PATIENT_CREATE',
      patientId: newPatient.id,
      patientName: name,
      updatedAt: new Date().toISOString()
    });

    return res.status(201).json(newPatient);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Medical Records
app.get('/api/records/patient/:patientId', authenticateToken, authorizeRoles('hospital', 'insurance', 'admin'), async (req, res) => {
  const { patientId } = req.params;
  try {
    const result = await pool.query('SELECT * FROM medical_records WHERE patient_id = $1 ORDER BY created_at DESC', [patientId]);
    const processed = result.rows.map(record => {
      const r = { ...record };
      r.diagnosis_notes = decrypt(r.encrypted_diagnosis_notes);
      delete r.encrypted_diagnosis_notes;
      return r;
    });
    return res.json(processed);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/records', authenticateToken, authorizeRoles('hospital', 'admin'), auditAction('CREATE_MEDICAL_RECORD', 'medical_records'), async (req, res) => {
  const { patient_id, doctor_name, diagnosis_notes, treatment_plan, status } = req.body;
  if (!patient_id || !doctor_name || !diagnosis_notes || !treatment_plan || !status) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    const encNotes = encrypt(diagnosis_notes);
    const result = await pool.query(
      `INSERT INTO medical_records (patient_id, doctor_name, encrypted_diagnosis_notes, treatment_plan, status)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [patient_id, doctor_name, encNotes, treatment_plan, status]
    );

    const newRecord = result.rows[0];
    newRecord.diagnosis_notes = diagnosis_notes;
    delete newRecord.encrypted_diagnosis_notes;

    // Trigger real-time sync across other roles
    io.emit('record_updated', {
      type: 'RECORD_CREATE',
      patientId: patient_id,
      updatedAt: new Date().toISOString()
    });

    return res.status(201).json(newRecord);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Lab Results Management
app.get('/api/labs', authenticateToken, authorizeRoles('lab', 'hospital', 'admin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT lr.*, p.name as patient_name 
      FROM lab_results lr
      JOIN patients p ON lr.patient_id = p.id
      ORDER BY lr.created_at DESC
    `);
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/labs', authenticateToken, authorizeRoles('lab', 'hospital', 'admin'), auditAction('CREATE_LAB_REQUEST', 'lab_results'), async (req, res) => {
  const { patient_id, test_name, test_date } = req.body;
  if (!patient_id || !test_name || !test_date) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO lab_results (patient_id, test_name, test_date, status)
       VALUES ($1, $2, $3, 'pending') RETURNING *`,
      [patient_id, test_name, test_date]
    );

    io.emit('lab_updated', {
      type: 'LAB_REQUEST',
      patientId: patient_id,
      updatedAt: new Date().toISOString()
    });

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.put('/api/labs/:id', authenticateToken, authorizeRoles('lab', 'admin'), auditAction('UPLOAD_LAB_RESULTS', 'lab_results'), async (req, res) => {
  const { id } = req.params;
  const { results, technician_name } = req.body;
  if (!results || !technician_name) {
    return res.status(400).json({ message: 'Results and Technician Name are required' });
  }

  try {
    const result = await pool.query(
      `UPDATE lab_results 
       SET results = $1, status = 'completed', technician_name = $2 
       WHERE id = $3 RETURNING *`,
      [results, technician_name, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Lab result record not found' });
    }

    io.emit('lab_updated', {
      type: 'LAB_UPLOAD',
      patientId: result.rows[0].patient_id,
      updatedAt: new Date().toISOString()
    });

    return res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Prescriptions
app.get('/api/prescriptions', authenticateToken, authorizeRoles('pharmacy', 'hospital', 'admin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT pr.*, p.name as patient_name 
      FROM prescriptions pr
      JOIN patients p ON pr.patient_id = p.id
      ORDER BY pr.created_at DESC
    `);
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/prescriptions', authenticateToken, authorizeRoles('hospital', 'admin'), auditAction('CREATE_PRESCRIPTION', 'prescriptions'), async (req, res) => {
  const { patient_id, medication, dosage, instructions } = req.body;
  if (!patient_id || !medication || !dosage) {
    return res.status(400).json({ message: 'Patient, Medication, and Dosage are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO prescriptions (patient_id, medication, dosage, instructions, status)
       VALUES ($1, $2, $3, $4, 'active') RETURNING *`,
      [patient_id, medication, dosage, instructions]
    );

    io.emit('prescription_updated', {
      type: 'PRESCRIPTION_CREATE',
      patientId: patient_id,
      updatedAt: new Date().toISOString()
    });

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.put('/api/prescriptions/:id/dispense', authenticateToken, authorizeRoles('pharmacy', 'admin'), auditAction('DISPENSE_PRESCRIPTION', 'prescriptions'), async (req, res) => {
  const { id } = req.params;
  try {
    const result = await pool.query(
      `UPDATE prescriptions SET status = 'dispensed' WHERE id = $1 RETURNING *`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Prescription not found' });
    }

    io.emit('prescription_updated', {
      type: 'PRESCRIPTION_DISPENSE',
      patientId: result.rows[0].patient_id,
      updatedAt: new Date().toISOString()
    });

    return res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Insurance Claims
app.get('/api/claims', authenticateToken, authorizeRoles('insurance', 'hospital', 'admin'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT ic.*, p.name as patient_name 
      FROM insurance_claims ic
      JOIN patients p ON ic.patient_id = p.id
      ORDER BY ic.created_at DESC
    `);
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.post('/api/claims', authenticateToken, authorizeRoles('hospital', 'admin'), auditAction('CREATE_CLAIM', 'insurance_claims'), async (req, res) => {
  const { patient_id, amount, diagnosis_code, notes } = req.body;
  if (!patient_id || !amount || !diagnosis_code) {
    return res.status(400).json({ message: 'Patient, Amount, and Diagnosis Code are required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO insurance_claims (patient_id, amount, diagnosis_code, status, notes)
       VALUES ($1, $2, $3, 'pending', $4) RETURNING *`,
      [patient_id, amount, diagnosis_code, notes]
    );

    io.emit('record_updated', {
      type: 'CLAIM_CREATE',
      patientId: patient_id,
      updatedAt: new Date().toISOString()
    });

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

app.put('/api/claims/:id/status', authenticateToken, authorizeRoles('insurance', 'admin'), auditAction('PROCESS_CLAIM', 'insurance_claims'), async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'Invalid claim status (must be approved or rejected)' });
  }

  try {
    const result = await pool.query(
      `UPDATE insurance_claims SET status = $1 WHERE id = $2 RETURNING *`,
      [status, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Claim not found' });
    }

    io.emit('record_updated', {
      type: 'CLAIM_PROCESS',
      patientId: result.rows[0].patient_id,
      updatedAt: new Date().toISOString()
    });

    return res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Admin System Logs & Audit Viewer
app.get('/api/admin/logs', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 200');
    return res.json(result.rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// Real-time server diagnostics status reporting for Admin dashboard
app.get('/api/admin/system', authenticateToken, authorizeRoles('admin'), async (req, res) => {
  try {
    const activeConnections = io.engine.clientsCount;
    const dbSizeRes = await pool.query("SELECT pg_size_pretty(pg_database_size('healthcare_db')) as size");
    const dbSize = dbSizeRes.rows[0].size;
    
    // Simulate MinIO status check
    const storageRes = { status: 'online', bucket: 'backups' };

    return res.json({
      activeConnections,
      databaseSize: dbSize,
      storageStatus: storageRes.status,
      storageBucket: storageRes.bucket,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ message: 'Internal server error' });
  }
});


// Socket IO logic connection handler
io.on('connection', (socket) => {
  console.log('Client connected for real-time synchronization:', socket.id);
  socket.on('disconnect', () => {
    console.log('Client disconnected from synchronizer:', socket.id);
  });
});

// Bootstrapping function
const PORT = process.env.PORT || 5000;
async function startServer() {
  // 1. Fetch from Vault (or fallback)
  await loadSecrets();
  
  // 2. Initialize Database tables
  await initDb();
  
  // 3. Start listener
  server.listen(PORT, () => {
    console.log(`Healthcare Exchange Server running on port ${PORT}`);
  });
}

// Export for test suite running
if (require.main === module) {
  startServer();
}

module.exports = { app, server };
