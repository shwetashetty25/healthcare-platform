const bcrypt = require('bcryptjs');
const { pool, initDb } = require('./db');
const { encrypt } = require('../utils/encryption');

const seed = async () => {
  try {
    // Ensure tables exist
    await initDb();

    console.log('Truncating tables...');
    await pool.query('TRUNCATE users, patients, medical_records, lab_results, prescriptions, insurance_claims, audit_logs CASCADE');

    console.log('Seeding users...');
    const salt = await bcrypt.genSalt(10);
    const passHospital = await bcrypt.hash('hospital123', salt);
    const passLab = await bcrypt.hash('lab123', salt);
    const passPharmacy = await bcrypt.hash('pharmacy123', salt);
    const passInsurance = await bcrypt.hash('insurance123', salt);
    const passAdmin = await bcrypt.hash('admin123', salt);

    await pool.query(`
      INSERT INTO users (username, password_hash, role) VALUES
      ('hospital_user', '${passHospital}', 'hospital'),
      ('lab_user', '${passLab}', 'lab'),
      ('pharmacy_user', '${passPharmacy}', 'pharmacy'),
      ('insurance_user', '${passInsurance}', 'insurance'),
      ('admin_user', '${passAdmin}', 'admin')
    `);

    console.log('Seeding patients...');
    const patientData = [
      { name: 'Aarav Mehta', dob: '1980-04-12', gender: 'Male', nid: 'NID-8829-1029' },
      { name: 'Priya Sharma', dob: '1992-11-23', gender: 'Female', nid: 'NID-7341-9238' },
      { name: 'Amit Patel', dob: '1975-08-05', gender: 'Male', nid: 'NID-1023-4567' }
    ];

    const patients = [];
    for (const p of patientData) {
      const encNid = encrypt(p.nid);
      const res = await pool.query(
        'INSERT INTO patients (name, date_of_birth, gender, encrypted_national_id) VALUES ($1, $2, $3, $4) RETURNING *',
        [p.name, p.dob, p.gender, encNid]
      );
      patients.push(res.rows[0]);
    }

    console.log('Seeding medical records...');
    const recordData = [
      { patient_id: patients[0].id, doctor: 'Dr. R. K. Sen', notes: 'Patient presenting with hypertension. Blood pressure measured at 150/95.', plan: 'Initiate Lisinopril 10mg daily. Monitor weekly.', status: 'Active' },
      { patient_id: patients[1].id, doctor: 'Dr. S. Chatterjee', notes: 'Persistent cough and low-grade fever for 2 weeks.', plan: 'Recommending chest X-ray and CBC lab work. Prescribed cough syrup.', status: 'Active' }
    ];

    for (const r of recordData) {
      const encNotes = encrypt(r.notes);
      await pool.query(
        'INSERT INTO medical_records (patient_id, doctor_name, encrypted_diagnosis_notes, treatment_plan, status) VALUES ($1, $2, $3, $4, $5)',
        [r.patient_id, r.doctor, encNotes, r.plan, r.status]
      );
    }

    console.log('Seeding lab results...');
    await pool.query(`
      INSERT INTO lab_results (patient_id, test_name, test_date, results, status, technician_name) VALUES
      (${patients[0].id}, 'Lipid Profile', '2026-06-01', 'Cholesterol: 220 mg/dL, HDL: 45 mg/dL, LDL: 145 mg/dL', 'completed', 'Tech Joy'),
      (${patients[1].id}, 'Complete Blood Count (CBC)', '2026-06-10', 'WBC: 11,000 cells/mcL (Elevated), RBC: 4.8 million cells/mcL', 'completed', 'Tech Joy'),
      (${patients[2].id}, 'HbA1c Blood Test', '2026-06-14', NULL, 'pending', NULL)
    `);

    console.log('Seeding prescriptions...');
    await pool.query(`
      INSERT INTO prescriptions (patient_id, medication, dosage, instructions, status) VALUES
      (${patients[0].id}, 'Lisinopril', '10mg', 'Take 1 tablet daily in the morning', 'active'),
      (${patients[1].id}, 'Amoxicillin', '500mg', 'Take 1 capsule thrice daily for 7 days', 'active'),
      (${patients[2].id}, 'Metformin', '500mg', 'Take 1 tablet twice daily with meals', 'dispensed')
    `);

    console.log('Seeding insurance claims...');
    await pool.query(`
      INSERT INTO insurance_claims (patient_id, amount, diagnosis_code, status, notes) VALUES
      (${patients[0].id}, 1500.00, 'ICD-10-I10', 'approved', 'Fully covered under standard corporate health plan.'),
      (${patients[1].id}, 450.00, 'ICD-10-R05', 'pending', 'Awaiting laboratory confirmation details.')
    `);

    console.log('Seeding audit logs...');
    await pool.query(`
      INSERT INTO audit_logs (user_id, username, role, action, resource, details) VALUES
      (5, 'admin_user', 'admin', 'SYSTEM_INITIALIZATION', 'database', 'Database seeded with initial administrative and testing healthcare records.')
    `);

    console.log('Database seeded successfully!');
  } catch (err) {
    console.error('Error seeding database:', err);
    process.exit(1);
  }
};

if (require.main === module) {
  seed().then(() => pool.end());
}

module.exports = seed;
