const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const dbPath = path.join(__dirname, 'data', 'library.db');

if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'), { recursive: true });
}

const db = new sqlite3.Database(dbPath);

const dbAsync = {
  all: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },
  get: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  run: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }
};

async function initDatabase() {
  console.log('Initializing database schema...');

  await dbAsync.run('PRAGMA foreign_keys = ON;');

  // Users Table
  await dbAsync.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Books Table
  await dbAsync.run(`
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      category TEXT NOT NULL,
      isbn TEXT UNIQUE NOT NULL,
      total_copies INTEGER DEFAULT 1,
      description TEXT,
      cover_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Bookings Table
  await dbAsync.run(`
    CREATE TABLE IF NOT EXISTS bookings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_ref TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL,
      book_id INTEGER NOT NULL,
      booking_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      status TEXT DEFAULT 'confirmed',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(book_id) REFERENCES books(id) ON DELETE CASCADE
    )
  `);

  // System Settings Table
  await dbAsync.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  await dbAsync.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('max_active_bookings', '3');`);
  await dbAsync.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('max_booking_hours', '4');`);
  await dbAsync.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('max_advance_days', '14');`);

  // Seed default admin and demo user
  const adminPasswordHash = await bcrypt.hash('admin123', 10);
  const userPasswordHash = await bcrypt.hash('user123', 10);

  await dbAsync.run(`
    INSERT OR IGNORE INTO users (id, name, email, password, role)
    VALUES (1, 'Admin Manager', 'admin@library.com', ?, 'admin')
  `, [adminPasswordHash]);

  await dbAsync.run(`
    INSERT OR IGNORE INTO users (id, name, email, password, role)
    VALUES (2, 'Alex Johnson', 'user@library.com', ?, 'user')
  `, [userPasswordHash]);

  // Seed Books catalog if empty
  const bookCount = await dbAsync.get('SELECT COUNT(*) as count FROM books');
  if (bookCount.count === 0) {
    console.log('Seeding initial book catalog...');
    const seedBooks = [
      {
        title: 'Clean Code: A Handbook of Agile Software Craftsmanship',
        author: 'Robert C. Martin',
        category: 'Technology',
        isbn: '978-0132350884',
        total_copies: 2,
        description: 'Even bad code can function. But if code isn\'t clean, it can bring a development organization to its knees.',
        cover_url: 'https://images.unsplash.com/photo-1532012197267-da84d127e765?auto=format&fit=crop&w=400&q=80'
      },
      {
        title: 'Designing Data-Intensive Applications',
        author: 'Martin Kleppmann',
        category: 'Technology',
        isbn: '978-1449373320',
        total_copies: 3,
        description: 'An invaluable guide for software engineers and architects navigating distributed systems and databases.',
        cover_url: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80'
      },
      {
        title: 'The Pragmatic Programmer',
        author: 'Andrew Hunt & David Thomas',
        category: 'Technology',
        isbn: '978-0135957059',
        total_copies: 2,
        description: 'Illustrates best approaches and major pitfalls of many aspects of software development.',
        cover_url: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=400&q=80'
      },
      {
        title: 'Sapiens: A Brief History of Humankind',
        author: 'Yuval Noah Harari',
        category: 'History',
        isbn: '978-0062316097',
        total_copies: 3,
        description: 'Explores how Homo sapiens conquered Earth and shaped modern societies.',
        cover_url: 'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?auto=format&fit=crop&w=400&q=80'
      },
      {
        title: 'Atomic Habits',
        author: 'James Clear',
        category: 'Self-Help',
        isbn: '978-0735211292',
        total_copies: 4,
        description: 'An easy & proven way to build good habits & break bad ones.',
        cover_url: 'https://images.unsplash.com/photo-1589829085413-56de8ae18c73?auto=format&fit=crop&w=400&q=80'
      },
      {
        title: 'Dune',
        author: 'Frank Herbert',
        category: 'Fiction',
        isbn: '978-0441172719',
        total_copies: 2,
        description: 'Set on the desert planet Arrakis, Dune is the story of the boy Paul Atreides.',
        cover_url: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&w=400&q=80'
      },
      {
        title: 'Astrophysics for People in a Hurry',
        author: 'Neil deGrasse Tyson',
        category: 'Science',
        isbn: '978-0393609394',
        total_copies: 2,
        description: 'A quick and witty guide to fundamental cosmic questions.',
        cover_url: 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=400&q=80'
      },
      {
        title: 'Zero to One',
        author: 'Peter Thiel',
        category: 'Business',
        isbn: '978-0804139298',
        total_copies: 3,
        description: 'Notes on Startups, or How to Build the Future.',
        cover_url: 'https://images.unsplash.com/photo-1553729459-efe14ef6055d?auto=format&fit=crop&w=400&q=80'
      }
    ];

    for (const book of seedBooks) {
      await dbAsync.run(`
        INSERT INTO books (title, author, category, isbn, total_copies, description, cover_url)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [book.title, book.author, book.category, book.isbn, book.total_copies, book.description, book.cover_url]);
    }
  }

  // Seed sample booking for demo user if none exists
  const bookingCount = await dbAsync.get('SELECT COUNT(*) as count FROM bookings');
  if (bookingCount.count === 0) {
    const today = new Date().toISOString().split('T')[0];
    await dbAsync.run(`
      INSERT INTO bookings (booking_ref, user_id, book_id, booking_date, start_time, end_time, status)
      VALUES ('LIB-DEMO1', 2, 1, ?, '10:00', '12:00', 'confirmed')
    `, [today]);
  }

  console.log('Database initialization complete.');
}

module.exports = { db, dbAsync, initDatabase };
