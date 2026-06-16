const { Pool } = require('pg');
require('dotenv').config();

const poolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'healthcare_db',
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

const pool = new Pool(poolConfig);

const initDb = async (retries = 5) => {
  while (retries) {
    try {
      console.log(`Connecting to PostgreSQL at ${poolConfig.host}:${poolConfig.port}...`);
      const client = await pool.connect();
      console.log('Connected to PostgreSQL successfully!');
      
      // Create tables
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          role VARCHAR(20) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS patients (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          date_of_birth DATE NOT NULL,
          gender VARCHAR(20) NOT NULL,
          encrypted_national_id VARCHAR(500) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS medical_records (
          id SERIAL PRIMARY KEY,
          patient_id INT REFERENCES patients(id) ON DELETE CASCADE,
          doctor_name VARCHAR(100) NOT NULL,
          encrypted_diagnosis_notes TEXT NOT NULL,
          treatment_plan TEXT NOT NULL,
          status VARCHAR(20) NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS lab_results (
          id SERIAL PRIMARY KEY,
          patient_id INT REFERENCES patients(id) ON DELETE CASCADE,
          test_name VARCHAR(100) NOT NULL,
          test_date DATE NOT NULL,
          results TEXT,
          status VARCHAR(20) DEFAULT 'pending',
          technician_name VARCHAR(100),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS prescriptions (
          id SERIAL PRIMARY KEY,
          patient_id INT REFERENCES patients(id) ON DELETE CASCADE,
          medication VARCHAR(100) NOT NULL,
          dosage VARCHAR(50) NOT NULL,
          instructions TEXT,
          status VARCHAR(20) DEFAULT 'active',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS insurance_claims (
          id SERIAL PRIMARY KEY,
          patient_id INT REFERENCES patients(id) ON DELETE CASCADE,
          amount DECIMAL(10,2) NOT NULL,
          diagnosis_code VARCHAR(20) NOT NULL,
          status VARCHAR(20) DEFAULT 'pending',
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
          id SERIAL PRIMARY KEY,
          user_id INT,
          username VARCHAR(50),
          role VARCHAR(20),
          action VARCHAR(100) NOT NULL,
          resource VARCHAR(100) NOT NULL,
          details TEXT,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      console.log('Database tables verified/created successfully.');
      client.release();
      break;
    } catch (err) {
      console.error(`PostgreSQL connection failed. Retries remaining: ${retries - 1}. Error:`, err.message);
      retries -= 1;
      if (retries === 0) {
        throw new Error('Could not connect to PostgreSQL database after multiple attempts.');
      }
      await new Promise(res => setTimeout(res, 3000));
    }
  }
};

module.exports = {
  pool,
  initDb,
  query: (text, params) => pool.query(text, params),
};
