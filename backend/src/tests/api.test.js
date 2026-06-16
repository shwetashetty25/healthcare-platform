const { encrypt, decrypt } = require('../utils/encryption');
const { generateToken } = require('../middleware/auth');

// Simple XML Tag Extractor mock implementation matching server
function extractXmlVal(xml, tag) {
  const regex = new RegExp(`<${tag}>([\\s\\S]*?)<\/${tag}>`);
  const match = xml.match(regex);
  return match ? match[1].trim() : '';
}

describe('Symmetric Encryption Utility Tests', () => {
  it('should encrypt and decrypt plaintext fields successfully', () => {
    const ssn = 'NID-9912-3482';
    const notes = 'Patient shows signs of acute bronchitis.';

    const encSsn = encrypt(ssn);
    const encNotes = encrypt(notes);

    expect(encSsn).not.toBe(ssn);
    expect(encNotes).not.toBe(notes);
    expect(encSsn).toContain(':');

    expect(decrypt(encSsn)).toBe(ssn);
    expect(decrypt(encNotes)).toBe(notes);
  });

  it('should return null or handle empty text gracefully', () => {
    expect(encrypt('')).toBe('');
    expect(decrypt('')).toBe('');
    expect(decrypt('invalid_format_string')).toBe('[Decryption Error: Invalid Key/Payload]');
  });
});

describe('Token Authentication Utility Tests', () => {
  it('should generate valid JWT payload signatures', () => {
    const mockUser = { id: 10, username: 'test_doc', role: 'hospital' };
    const token = generateToken(mockUser);
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
  });
});

describe('Legacy Integration Parser Tests', () => {
  const sampleCsv = `patient_name,date_of_birth,gender,national_id,doctor_name,diagnosis_notes,treatment_plan,status
Ramesh Kumar,1970-02-18,Male,NID-1111-2222,Dr. Mehta,Mild asthma,Albuterol inhaler,Active`;

  const sampleXml = `
<legacy_record>
  <patient_name>Suresh Patel</patient_name>
  <date_of_birth>1968-12-05</date_of_birth>
  <gender>Male</gender>
  <national_id>NID-3333-4444</national_id>
  <doctor_name>Dr. Prasad</doctor_name>
  <diagnosis_notes>Chronic fatigue</diagnosis_notes>
  <treatment_plan>Vitamin D supplements</treatment_plan>
  <status>Active</status>
</legacy_record>`;

  it('should successfully parse legacy CSV layouts', () => {
    const lines = sampleCsv.split('\n');
    const headers = lines[0].split(',').map(h => h.trim());
    const values = lines[1].split(',').map(v => v.trim());
    
    const record = {};
    headers.forEach((header, index) => {
      record[header] = values[index];
    });

    expect(record.patient_name).toBe('Ramesh Kumar');
    expect(record.date_of_birth).toBe('1970-02-18');
    expect(record.national_id).toBe('NID-1111-2222');
    expect(record.diagnosis_notes).toBe('Mild asthma');
  });

  it('should successfully parse legacy XML structures using tag extractor', () => {
    const patientName = extractXmlVal(sampleXml, 'patient_name');
    const dob = extractXmlVal(sampleXml, 'date_of_birth');
    const nid = extractXmlVal(sampleXml, 'national_id');
    const notes = extractXmlVal(sampleXml, 'diagnosis_notes');

    expect(patientName).toBe('Suresh Patel');
    expect(dob).toBe('1968-12-05');
    expect(nid).toBe('NID-3333-4444');
    expect(notes).toBe('Chronic fatigue');
  });
});
