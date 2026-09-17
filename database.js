const path = require('path');
const os = require('os');
const bcrypt = require('bcryptjs');
const fs = require('fs');

let useNativeSqlite = false;
let db = null;

const dbFolder = process.env.VERCEL ? os.tmpdir() : path.join(__dirname, 'data');
const dbPath = path.join(dbFolder, 'library.db');

if (!fs.existsSync(dbFolder)) {
  try { fs.mkdirSync(dbFolder, { recursive: true }); } catch (e) {}
}

try {
  const sqlite3 = require('sqlite3').verbose();
  db = new sqlite3.Database(dbPath);
  useNativeSqlite = true;
  console.log('Using native SQLite engine.');
} catch (e) {
  console.log('Native SQLite unavailable on this runtime, switching to Pure JS Data Engine.');
  useNativeSqlite = false;
}

const nativeDbAsync = {
  all: (sql, params = []) => new Promise((resolve, reject) => db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows))),
  get: (sql, params = []) => new Promise((resolve, reject) => db.get(sql, params, (err, row) => err ? reject(err) : resolve(row))),
  run: (sql, params = []) => new Promise((resolve, reject) => db.run(sql, params, function(err) { err ? reject(err) : resolve({ id: this.lastID, changes: this.changes }); }))
};

// Pure JS Storage Engine (Zero Native Dependencies - Vercel Safe)
const store = {
  users: [],
  books: [],
  bookings: [],
  settings: {
    max_active_bookings: '3',
    max_booking_hours: '4',
    max_advance_days: '14'
  },
  autoId: { users: 1, books: 1, bookings: 1 }
};

const jsDbAsync = {
  all: async (sql, params = []) => {
    const s = sql.toLowerCase();

    // 1. Get user bookings with book info
    if (s.includes('from bookings b') && s.includes('join books bk') && s.includes('where b.user_id')) {
      const userId = Number(params[0]);
      return store.bookings
        .filter(b => Number(b.user_id) === userId)
        .map(b => {
          const bk = store.books.find(x => x.id === Number(b.book_id)) || {};
          return {
            ...b,
            book_title: bk.title || '',
            book_author: bk.author || '',
            cover_url: bk.cover_url || '',
            isbn: bk.isbn || '',
            category: bk.category || ''
          };
        })
        .sort((a, b) => (b.booking_date || '').localeCompare(a.booking_date || ''));
    }

    // 2. Admin bookings list
    if (s.includes('from bookings b') && s.includes('join users u') && s.includes('join books bk')) {
      let list = store.bookings.map(b => {
        const u = store.users.find(x => x.id === Number(b.user_id)) || {};
        const bk = store.books.find(x => x.id === Number(b.book_id)) || {};
        return {
          ...b,
          user_name: u.name || 'Unknown',
          user_email: u.email || '',
          book_title: bk.title || '',
          book_isbn: bk.isbn || ''
        };
      });

      let pIdx = 0;
      if (s.includes('b.status = ?')) {
        const statusVal = params[pIdx++];
        list = list.filter(b => b.status === statusVal);
      }
      if (s.includes('b.booking_date = ?')) {
        const dateVal = params[pIdx++];
        list = list.filter(b => b.booking_date === dateVal);
      }
      if (s.includes('u.name like')) {
        const term = (params[pIdx] || '').replace(/%/g, '').toLowerCase();
        pIdx += 4;
        list = list.filter(b => 
          (b.user_name || '').toLowerCase().includes(term) ||
          (b.user_email || '').toLowerCase().includes(term) ||
          (b.book_title || '').toLowerCase().includes(term) ||
          (b.booking_ref || '').toLowerCase().includes(term)
        );
      }

      return list.sort((a, b) => (b.booking_date || '').localeCompare(a.booking_date || ''));
    }

    // 3. Bookings for book on date
    if (s.includes('from bookings') && s.includes('book_id = ?') && s.includes('booking_date = ?')) {
      const [bookId, date] = params;
      return store.bookings.filter(b => 
        b.book_id === Number(bookId) && 
        b.booking_date === date && 
        ['confirmed', 'checked_out'].includes(b.status)
      ).sort((a, b) => (a.start_time || '').localeCompare(b.start_time || ''));
    }

    // 4. Bookings grouped count for date
    if (s.includes('from bookings') && s.includes('group by book_id')) {
      const date = params[0];
      const map = {};
      store.bookings
        .filter(b => b.booking_date === date && ['confirmed', 'checked_out'].includes(b.status))
        .forEach(b => {
          map[b.book_id] = (map[b.book_id] || 0) + 1;
        });
      return Object.keys(map).map(id => ({ book_id: Number(id), booked_count: map[id] }));
    }

    // 5. Books list with search & category filter
    if (s.includes('from books') && s.includes('where 1=1')) {
      let list = [...store.books];
      let pIdx = 0;

      if (s.includes('title like')) {
        const term = (params[pIdx] || '').replace(/%/g, '').toLowerCase();
        pIdx += 3;
        list = list.filter(b => 
          (b.title || '').toLowerCase().includes(term) || 
          (b.author || '').toLowerCase().includes(term) || 
          (b.isbn || '').toLowerCase().includes(term)
        );
      }

      if (s.includes('category = ?')) {
        const cat = params[pIdx++];
        list = list.filter(b => b.category === cat);
      }

      return list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }

    // 6. Distinct categories
    if (s.includes('select distinct category from books')) {
      const cats = Array.from(new Set(store.books.map(b => b.category))).sort();
      return cats.map(c => ({ category: c }));
    }

    // 7. Admin Users list
    if (s.includes('from users u') && s.includes('left join bookings b')) {
      return store.users.map(u => {
        const userBookings = store.bookings.filter(b => b.user_id === u.id);
        const activeBookings = userBookings.filter(b => ['confirmed', 'checked_out'].includes(b.status)).length;
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          status: u.status,
          created_at: u.created_at,
          total_bookings: userBookings.length,
          active_bookings: activeBookings
        };
      });
    }

    // 8. Popular books
    if (s.includes('popular') || (s.includes('from books bk') && s.includes('group by bk.id'))) {
      return store.books.map(b => {
        const count = store.bookings.filter(x => x.book_id === b.id).length;
        return { id: b.id, title: b.title, author: b.author, booking_count: count };
      }).sort((a, b) => b.booking_count - a.booking_count).slice(0, 5);
    }

    // 9. Settings
    if (s.includes('from settings')) {
      return Object.keys(store.settings).map(k => ({ key: k, value: store.settings[k] }));
    }

    return [];
  },

  get: async (sql, params = []) => {
    const s = sql.toLowerCase();

    // User by email
    if (s.includes('from users where email = ?')) {
      return store.users.find(u => u.email === params[0].toLowerCase()) || null;
    }

    // User by id
    if (s.includes('from users where id = ?')) {
      return store.users.find(u => u.id === Number(params[0])) || null;
    }

    // Book by id
    if (s.includes('from books where id = ?')) {
      return store.books.find(b => b.id === Number(params[0])) || null;
    }

    // Book by isbn
    if (s.includes('from books where isbn = ?')) {
      const isbn = params[0];
      const excludeId = params[1];
      return store.books.find(b => b.isbn === isbn && (!excludeId || b.id !== Number(excludeId))) || null;
    }

    // Booking by id
    if (s.includes('from bookings') && s.includes('b.id = ?')) {
      const b = store.bookings.find(x => x.id === Number(params[0]));
      if (!b) return null;
      const bk = store.books.find(x => x.id === b.book_id) || {};
      return { ...b, book_title: bk.title, book_author: bk.author, cover_url: bk.cover_url };
    }

    if (s.includes('from bookings where id = ?')) {
      return store.bookings.find(x => x.id === Number(params[0])) || null;
    }

    // Settings by key
    if (s.includes('from settings where key = ?')) {
      const k = params[0];
      return store.settings[k] ? { value: store.settings[k] } : null;
    }

    // Counts
    if (s.includes('count(*) as count from books')) {
      return { count: store.books.length };
    }

    if (s.includes('sum(total_copies) as count from books')) {
      const sum = store.books.reduce((acc, b) => acc + (b.total_copies || 0), 0);
      return { count: sum };
    }

    if (s.includes("count(*) as count from users where role = 'user'")) {
      return { count: store.users.filter(u => u.role === 'user').length };
    }

    if (s.includes("count(*) as count from bookings where status in ('confirmed', 'checked_out')")) {
      return { count: store.bookings.filter(b => ['confirmed', 'checked_out'].includes(b.status)).length };
    }

    if (s.includes('count(*) as count from bookings where booking_date = ?')) {
      return { count: store.bookings.filter(b => b.booking_date === params[0]).length };
    }

    // User active bookings count
    if (s.includes('count(*) as count from bookings') && s.includes('user_id = ?')) {
      return { count: store.bookings.filter(b => b.user_id === Number(params[0]) && ['confirmed', 'checked_out'].includes(b.status)).length };
    }

    // Overlapping bookings count
    if (s.includes('count(*) as count from bookings') && s.includes('book_id = ?') && s.includes('booking_date = ?')) {
      const [bookId, date, endTime, startTime] = params;
      const count = store.bookings.filter(b => 
        b.book_id === Number(bookId) &&
        b.booking_date === date &&
        ['confirmed', 'checked_out'].includes(b.status) &&
        (b.start_time < endTime && b.end_time > startTime)
      ).length;
      return { count };
    }

    return null;
  },

  run: async (sql, params = []) => {
    const s = sql.toLowerCase();

    // Insert user
    if (s.includes('insert into users')) {
      const [name, email, password, role] = params;
      const id = store.autoId.users++;
      const newUser = { id, name, email: email.toLowerCase(), password, role: role || 'user', status: 'active', created_at: new Date().toISOString() };
      store.users.push(newUser);
      return { id, changes: 1 };
    }

    // Insert book
    if (s.includes('insert into books')) {
      const [title, author, category, isbn, total_copies, description, cover_url] = params;
      const id = store.autoId.books++;
      const newBook = { id, title, author, category, isbn, total_copies: Number(total_copies), description, cover_url, created_at: new Date().toISOString() };
      store.books.push(newBook);
      return { id, changes: 1 };
    }

    // Update book
    if (s.includes('update books')) {
      const [title, author, category, isbn, total_copies, description, cover_url, bookId] = params;
      const b = store.books.find(x => x.id === Number(bookId));
      if (b) {
        b.title = title; b.author = author; b.category = category; b.isbn = isbn;
        b.total_copies = Number(total_copies); b.description = description; b.cover_url = cover_url;
      }
      return { id: Number(bookId), changes: 1 };
    }

    // Delete book
    if (s.includes('delete from books')) {
      const bookId = Number(params[0]);
      store.books = store.books.filter(x => x.id !== bookId);
      store.bookings = store.bookings.filter(x => x.book_id !== bookId);
      return { changes: 1 };
    }

    // Insert booking
    if (s.includes('insert into bookings')) {
      const [booking_ref, user_id, book_id, booking_date, start_time, end_time] = params;
      const id = store.autoId.bookings++;
      const newBooking = { id, booking_ref, user_id: Number(user_id), book_id: Number(book_id), booking_date, start_time, end_time, status: 'confirmed', created_at: new Date().toISOString() };
      store.bookings.push(newBooking);
      return { id, changes: 1 };
    }

    // Update booking status
    if (s.includes('update bookings set status = ?')) {
      const [status, bookingId] = params;
      const b = store.bookings.find(x => x.id === Number(bookingId));
      if (b) b.status = status;
      return { changes: 1 };
    }

    // Update user role / status
    if (s.includes('update users set role = ?')) {
      const [role, userId] = params;
      const u = store.users.find(x => x.id === Number(userId));
      if (u) u.role = role;
      return { changes: 1 };
    }

    if (s.includes('update users set status = ?')) {
      const [status, userId] = params;
      const u = store.users.find(x => x.id === Number(userId));
      if (u) u.status = status;
      return { changes: 1 };
    }

    // Insert or replace settings
    if (s.includes('into settings')) {
      const [key, value] = params;
      store.settings[key] = value;
      return { changes: 1 };
    }

    return { id: 0, changes: 0 };
  }
};

const dbAsync = useNativeSqlite ? nativeDbAsync : jsDbAsync;

let initialized = false;

async function initDatabase() {
  if (initialized) return;

  if (useNativeSqlite) {
    await nativeDbAsync.run('PRAGMA foreign_keys = ON;');
    await nativeDbAsync.run(`
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
    await nativeDbAsync.run(`
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
    await nativeDbAsync.run(`
      CREATE TABLE IF NOT EXISTS bookings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        booking_ref TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        book_id INTEGER NOT NULL,
        booking_date TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        status TEXT DEFAULT 'confirmed',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await nativeDbAsync.run(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )
    `);
  }

  // Seed default admin and user
  const adminPasswordHash = await bcrypt.hash('admin123', 10);
  const userPasswordHash = await bcrypt.hash('user123', 10);

  const existingAdmin = await dbAsync.get('SELECT * FROM users WHERE email = ?', ['admin@library.com']);
  if (!existingAdmin) {
    await dbAsync.run('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', ['Admin Manager', 'admin@library.com', adminPasswordHash, 'admin']);
  }

  const existingUser = await dbAsync.get('SELECT * FROM users WHERE email = ?', ['user@library.com']);
  if (!existingUser) {
    await dbAsync.run('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)', ['Alex Johnson', 'user@library.com', userPasswordHash, 'user']);
  }

  // Seed Books catalog if empty
  const bookCount = await dbAsync.get('SELECT COUNT(*) as count FROM books');
  if (!bookCount || bookCount.count === 0) {
    const seedBooks = [
      { title: 'Clean Code: A Handbook of Agile Software Craftsmanship', author: 'Robert C. Martin', category: 'Technology', isbn: '978-0132350884', total_copies: 2, description: 'Even bad code can function. But if code isn\'t clean, it can bring a development organization to its knees.', cover_url: 'https://images.unsplash.com/photo-1532012197267-da84d127e765?auto=format&fit=crop&w=400&q=80' },
      { title: 'Designing Data-Intensive Applications', author: 'Martin Kleppmann', category: 'Technology', isbn: '978-1449373320', total_copies: 3, description: 'An invaluable guide for software engineers and architects navigating distributed systems.', cover_url: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=400&q=80' },
      { title: 'The Pragmatic Programmer', author: 'Andrew Hunt & David Thomas', category: 'Technology', isbn: '978-0135957059', total_copies: 2, description: 'Illustrates best approaches and major pitfalls of software development.', cover_url: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=400&q=80' },
      { title: 'Sapiens: A Brief History of Humankind', author: 'Yuval Noah Harari', category: 'History', isbn: '978-0062316097', total_copies: 3, description: 'Explores how Homo sapiens conquered Earth.', cover_url: 'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?auto=format&fit=crop&w=400&q=80' },
      { title: 'Atomic Habits', author: 'James Clear', category: 'Self-Help', isbn: '978-0735211292', total_copies: 4, description: 'An easy & proven way to build good habits.', cover_url: 'https://images.unsplash.com/photo-1589829085413-56de8ae18c73?auto=format&fit=crop&w=400&q=80' },
      { title: 'Dune', author: 'Frank Herbert', category: 'Fiction', isbn: '978-0441172719', total_copies: 2, description: 'Set on the desert planet Arrakis.', cover_url: 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&w=400&q=80' },
      { title: 'Astrophysics for People in a Hurry', author: 'Neil deGrasse Tyson', category: 'Science', isbn: '978-0393609394', total_copies: 2, description: 'A quick guide to cosmic questions.', cover_url: 'https://images.unsplash.com/photo-1507842217343-583bb7270b66?auto=format&fit=crop&w=400&q=80' },
      { title: 'Zero to One', author: 'Peter Thiel', category: 'Business', isbn: '978-0804139298', total_copies: 3, description: 'Notes on Startups, or How to Build the Future.', cover_url: 'https://images.unsplash.com/photo-1553729459-efe14ef6055d?auto=format&fit=crop&w=400&q=80' }
    ];
    for (const b of seedBooks) {
      await dbAsync.run('INSERT INTO books (title, author, category, isbn, total_copies, description, cover_url) VALUES (?, ?, ?, ?, ?, ?, ?)', [b.title, b.author, b.category, b.isbn, b.total_copies, b.description, b.cover_url]);
    }
  }

  // Seed sample booking
  const bookingCount = await dbAsync.get('SELECT COUNT(*) as count FROM bookings');
  if (!bookingCount || bookingCount.count === 0) {
    const today = new Date().toISOString().split('T')[0];
    await dbAsync.run("INSERT INTO bookings (booking_ref, user_id, book_id, booking_date, start_time, end_time, status) VALUES ('LIB-DEMO1', 2, 1, ?, '10:00', '12:00', 'confirmed')", [today]);
  }

  initialized = true;
  console.log('Database initialized successfully.');
}

module.exports = { db, dbAsync, initDatabase };
