const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Resolve __dirname for CommonJS in Node
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');
const DB_PATH = path.join(ROOT_DIR, 'college.db');

// Open SQLite database
const database = new sqlite3.Database(DB_PATH);

// Promisified helpers for sqlite3
function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    database.run(sql, params, function onRun(err) {
      if (err) {
        reject(err);
        return;
      }
      resolve(this);
    });
  });
}

function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    database.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(row);
    });
  });
}

function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    database.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows);
    });
  });
}

// Initialize database schema
database.serialize(() => {
  database.run('PRAGMA foreign_keys = ON');
  database.run(
    `CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reg_no TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      department TEXT NOT NULL,
      address TEXT NOT NULL,
      division TEXT NOT NULL
    )`
  );
});

/**
 * Generates the next registration number for the current year.
 * Format: COL{YYYY}{NNN} e.g., COL2025001
 */
async function generateRegistrationNumber() {
  const currentYear = new Date().getFullYear();
  const prefix = `COL${currentYear}`;

  const latest = await dbGet(
    `SELECT reg_no FROM students WHERE reg_no LIKE ? ORDER BY reg_no DESC LIMIT 1`,
    [`${prefix}%`]
  );

  let nextSequence = 1;
  if (latest && latest.reg_no) {
    const lastSeqStr = latest.reg_no.slice(-3);
    const lastSeq = parseInt(lastSeqStr, 10);
    if (!Number.isNaN(lastSeq)) {
      nextSequence = lastSeq + 1;
    }
  }

  const sequencePart = String(nextSequence).padStart(3, '0');
  return `${prefix}${sequencePart}`;
}

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(PUBLIC_DIR));

// Routes
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, department, address, division } = req.body;

    const missingFields = [];
    if (!name) missingFields.push('name');
    if (!email) missingFields.push('email');
    if (!department) missingFields.push('department');
    if (!address) missingFields.push('address');
    if (!division) missingFields.push('division');
    if (missingFields.length > 0) {
      res.status(400).json({ success: false, error: `Missing fields: ${missingFields.join(', ')}` });
      return;
    }

    const regNo = await generateRegistrationNumber();

    await dbRun(
      `INSERT INTO students (reg_no, name, email, department, address, division)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [regNo, name.trim(), email.trim(), department.trim(), address.trim(), division.trim()]
    );

    res.status(201).json({
      success: true,
      student: { reg_no: regNo, name, email, department, address, division }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

app.get('/api/students', async (req, res) => {
  try {
    const { department } = req.query;
    let students;
    if (department) {
      students = await dbAll(
        `SELECT id, reg_no, name, email, department, address, division
         FROM students WHERE department = ? ORDER BY id DESC`,
        [department]
      );
    } else {
      students = await dbAll(
        `SELECT id, reg_no, name, email, department, address, division
         FROM students ORDER BY id DESC`
      );
    }
    res.json({ success: true, students });
  } catch (err) {
    console.error('Fetch students error:', err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

// Fallback to index.html for root
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`College Directory server running on http://localhost:${PORT}`);
});


