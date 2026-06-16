const express = require('express');
const router = express.Router();
const { pool } = require('../db/db');
const { encrypt } = require('../utils/encryption');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { logAudit } = require('../middleware/audit');

// Simple XML Tag Extractor
function extractXmlVal(xml, tag) {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\/${tag}>`);
  const match = xml.match(regex);
  return match ? match[1].trim() : '';
}

// Handler for importing legacy data
router.post('/import', authenticateToken, authorizeRoles('hospital', 'admin'), async (req, res) => {
  const contentType = req.headers['content-type'] || '';
  const bodyText = req.body ? req.body.toString().trim() : '';

  if (!bodyText) {
    return res.status(400).json({ message: 'Empty request body' });
  }

  let record = {};

  try {
    if (contentType.includes('xml') || bodyText.startsWith('<')) {
      // Parse XML
      record = {
        patient_name: extractXmlVal(bodyText, 'patient_name'),
        date_of_birth: extractXmlVal(bodyText, 'date_of_birth'),
        gender: extractXmlVal(bodyText, 'gender'),
        national_id: extractXmlVal(bodyText, 'national_id'),
        doctor_name: extractXmlVal(bodyText, 'doctor_name'),
        diagnosis_notes: extractXmlVal(bodyText, 'diagnosis_notes'),
        treatment_plan: extractXmlVal(bodyText, 'treatment_plan'),
        status: extractXmlVal(bodyText, 'status') || 'Active'
      };
    } else {
      // Parse CSV (assume 2 lines: header and values)
      const lines = bodyText.split('\n');
      if (lines.length < 2) {
        return res.status(400).json({ message: 'Invalid CSV format' });
      }
      const headers = lines[0].split(',').map(h => h.trim());
      const values = lines[1].split(',').map(v => v.trim());

      headers.forEach((header, index) => {
        record[header] = values[index];
      });
    }

    // Validation
    const required = ['patient_name', 'date_of_birth', 'gender', 'national_id', 'doctor_name', 'diagnosis_notes', 'treatment_plan'];
    for (const key of required) {
      if (!record[key]) {
        return res.status(400).json({ message: `Missing required field: ${key}` });
      }
    }

    // Insert into DB
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Encrypt sensitive patient data
      const encryptedNationalId = encrypt(record.national_id);
      
      // Check if patient already exists (simulate exchange deduplication)
      let patientId;
      const patientRes = await client.query(
        'SELECT id FROM patients WHERE name = $1 AND date_of_birth = $2',
        [record.patient_name, record.date_of_birth]
      );

      if (patientRes.rows.length > 0) {
        patientId = patientRes.rows[0].id;
      } else {
        const insertPatient = await client.query(
          `INSERT INTO patients (name, date_of_birth, gender, encrypted_national_id)
           VALUES ($1, $2, $3, $4) RETURNING id`,
          [record.patient_name, record.date_of_birth, record.gender, encryptedNationalId]
        );
        patientId = insertPatient.rows[0].id;
      }

      // 2. Encrypt medical records diagnosis
      const encryptedDiagnosis = encrypt(record.diagnosis_notes);
      const insertRecord = await client.query(
        `INSERT INTO medical_records (patient_id, doctor_name, encrypted_diagnosis_notes, treatment_plan, status)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [patientId, record.doctor_name, encryptedDiagnosis, record.treatment_plan, record.status]
      );

      await client.query('COMMIT');

      // Socket update emission trigger
      const io = req.app.get('socketio');
      if (io) {
        io.emit('record_updated', {
          patientId,
          patientName: record.patient_name,
          updatedAt: new Date().toISOString()
        });
      }

      // Audit Log
      await logAudit(req, 'IMPORT_LEGACY', 'patients & medical_records', `Imported legacy record for patient: ${record.patient_name}, patientId: ${patientId}`);

      return res.status(201).json({
        message: 'Legacy record imported and integrated successfully',
        patientId,
        recordId: insertRecord.rows[0].id
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error('Legacy import error:', err);
    return res.status(500).json({ message: 'Failed to process legacy record integration', error: err.message });
  }
});

module.exports = router;
