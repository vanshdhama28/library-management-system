const express = require('express');
const router = express.Router();
const { dbAsync } = require('../database');
const { verifyAdmin } = require('../middleware/auth');

// All routes here require Admin authorization
router.use(verifyAdmin);

// GET /api/admin/stats - System analytics summary
router.get('/stats', async (req, res) => {
  try {
    const totalBooks = await dbAsync.get('SELECT COUNT(*) as count FROM books');
    const totalCopies = await dbAsync.get('SELECT SUM(total_copies) as count FROM books');
    const totalUsers = await dbAsync.get("SELECT COUNT(*) as count FROM users WHERE role = 'user'");
    const activeBookings = await dbAsync.get("SELECT COUNT(*) as count FROM bookings WHERE status IN ('confirmed', 'checked_out')");
    
    const today = new Date().toISOString().split('T')[0];
    const todayBookings = await dbAsync.get("SELECT COUNT(*) as count FROM bookings WHERE booking_date = ?", [today]);

    // Popular books
    const popularBooks = await dbAsync.all(`
      SELECT bk.id, bk.title, bk.author, COUNT(b.id) as booking_count
      FROM books bk
      LEFT JOIN bookings b ON bk.id = b.book_id
      GROUP BY bk.id
      ORDER BY booking_count DESC
      LIMIT 5
    `);

    res.json({
      total_books: totalBooks.count || 0,
      total_copies: totalCopies.count || 0,
      total_users: totalUsers.count || 0,
      active_bookings: activeBookings.count || 0,
      today_bookings: todayBookings.count || 0,
      popular_books: popularBooks
    });
  } catch (err) {
    console.error('Fetch admin stats error:', err);
    res.status(500).json({ error: 'Failed to load admin statistics.' });
  }
});

// --- BOOK MANAGEMENT (CRUD) ---

// POST /api/admin/books - Add book
router.post('/books', async (req, res) => {
  try {
    const { title, author, category, isbn, total_copies, description, cover_url } = req.body;

    if (!title || !author || !category || !isbn) {
      return res.status(400).json({ error: 'Title, author, category, and ISBN are required.' });
    }

    const existingIsbn = await dbAsync.get('SELECT * FROM books WHERE isbn = ?', [isbn.trim()]);
    if (existingIsbn) {
      return res.status(400).json({ error: 'A book with this ISBN already exists.' });
    }

    const copies = parseInt(total_copies || '1', 10);
    const defaultCover = cover_url || 'https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&w=400&q=80';

    const result = await dbAsync.run(
      `INSERT INTO books (title, author, category, isbn, total_copies, description, cover_url)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [title.trim(), author.trim(), category.trim(), isbn.trim(), copies, description || '', defaultCover]
    );

    const newBook = await dbAsync.get('SELECT * FROM books WHERE id = ?', [result.id]);
    res.status(201).json({ message: 'Book created successfully', book: newBook });
  } catch (err) {
    console.error('Add book error:', err);
    res.status(500).json({ error: 'Failed to create book.' });
  }
});

// PUT /api/admin/books/:id - Update book
router.put('/books/:id', async (req, res) => {
  try {
    const bookId = req.params.id;
    const { title, author, category, isbn, total_copies, description, cover_url } = req.body;

    const book = await dbAsync.get('SELECT * FROM books WHERE id = ?', [bookId]);
    if (!book) {
      return res.status(404).json({ error: 'Book not found.' });
    }

    if (isbn && isbn !== book.isbn) {
      const existingIsbn = await dbAsync.get('SELECT * FROM books WHERE isbn = ? AND id != ?', [isbn.trim(), bookId]);
      if (existingIsbn) {
        return res.status(400).json({ error: 'Another book with this ISBN already exists.' });
      }
    }

    await dbAsync.run(
      `UPDATE books 
       SET title = ?, author = ?, category = ?, isbn = ?, total_copies = ?, description = ?, cover_url = ?
       WHERE id = ?`,
      [
        title || book.title,
        author || book.author,
        category || book.category,
        isbn || book.isbn,
        parseInt(total_copies || book.total_copies, 10),
        description !== undefined ? description : book.description,
        cover_url || book.cover_url,
        bookId
      ]
    );

    const updatedBook = await dbAsync.get('SELECT * FROM books WHERE id = ?', [bookId]);
    res.json({ message: 'Book updated successfully', book: updatedBook });
  } catch (err) {
    console.error('Update book error:', err);
    res.status(500).json({ error: 'Failed to update book.' });
  }
});

// DELETE /api/admin/books/:id - Delete book
router.delete('/books/:id', async (req, res) => {
  try {
    const bookId = req.params.id;
    const book = await dbAsync.get('SELECT * FROM books WHERE id = ?', [bookId]);
    if (!book) {
      return res.status(404).json({ error: 'Book not found.' });
    }

    await dbAsync.run('DELETE FROM books WHERE id = ?', [bookId]);
    res.json({ message: 'Book deleted successfully.' });
  } catch (err) {
    console.error('Delete book error:', err);
    res.status(500).json({ error: 'Failed to delete book.' });
  }
});

// --- BOOKING MANAGEMENT ---

// GET /api/admin/bookings - List all system bookings with filters
router.get('/bookings', async (req, res) => {
  try {
    const { status, date, search } = req.query;
    let query = `
      SELECT b.*, u.name as user_name, u.email as user_email, bk.title as book_title, bk.isbn as book_isbn
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      JOIN books bk ON b.book_id = bk.id
      WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'All') {
      query += ' AND b.status = ?';
      params.push(status);
    }

    if (date) {
      query += ' AND b.booking_date = ?';
      params.push(date);
    }

    if (search) {
      query += ' AND (u.name LIKE ? OR u.email LIKE ? OR bk.title LIKE ? OR b.booking_ref LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term, term);
    }

    query += ' ORDER BY b.booking_date DESC, b.start_time DESC';
    const bookings = await dbAsync.all(query, params);

    res.json({ bookings });
  } catch (err) {
    console.error('Admin fetch bookings error details:', err.stack || err);
    res.status(500).json({ error: 'Failed to fetch bookings.' });
  }
});

// PATCH /api/admin/bookings/:id/status - Change status of a booking
router.patch('/bookings/:id/status', async (req, res) => {
  try {
    const bookingId = req.params.id;
    const { status } = req.body;

    const validStatuses = ['confirmed', 'checked_out', 'completed', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${validStatuses.join(', ')}` });
    }

    const booking = await dbAsync.get('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    await dbAsync.run('UPDATE bookings SET status = ? WHERE id = ?', [status, bookingId]);
    res.json({ message: `Booking status updated to ${status}.` });
  } catch (err) {
    console.error('Update booking status error:', err);
    res.status(500).json({ error: 'Failed to update booking status.' });
  }
});

// --- USER MANAGEMENT ---

// GET /api/admin/users - List users
router.get('/users', async (req, res) => {
  try {
    const users = await dbAsync.all(`
      SELECT u.id, u.name, u.email, u.role, u.status, u.created_at,
             COUNT(b.id) as total_bookings,
             SUM(CASE WHEN b.status IN ('confirmed', 'checked_out') THEN 1 ELSE 0 END) as active_bookings
      FROM users u
      LEFT JOIN bookings b ON u.id = b.user_id
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);

    res.json({ users });
  } catch (err) {
    console.error('Fetch users error:', err);
    res.status(500).json({ error: 'Failed to load users.' });
  }
});

// PATCH /api/admin/users/:id/role - Toggle user role (user/admin)
router.patch('/users/:id/role', async (req, res) => {
  try {
    const userId = req.params.id;
    const { role } = req.body;

    if (!['user', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Role must be user or admin.' });
    }

    await dbAsync.run('UPDATE users SET role = ? WHERE id = ?', [role, userId]);
    res.json({ message: `User role updated to ${role}.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user role.' });
  }
});

// PATCH /api/admin/users/:id/status - Toggle user status (active/suspended)
router.patch('/users/:id/status', async (req, res) => {
  try {
    const userId = req.params.id;
    const { status } = req.body;

    if (!['active', 'suspended'].includes(status)) {
      return res.status(400).json({ error: 'Status must be active or suspended.' });
    }

    await dbAsync.run('UPDATE users SET status = ? WHERE id = ?', [status, userId]);
    res.json({ message: `User status updated to ${status}.` });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update user status.' });
  }
});

// --- SYSTEM SETTINGS ---

// GET /api/admin/settings
router.get('/settings', async (req, res) => {
  try {
    const settingsRows = await dbAsync.all('SELECT * FROM settings');
    const settings = {};
    settingsRows.forEach(r => { settings[r.key] = r.value; });
    res.json({ settings });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load settings.' });
  }
});

// POST /api/admin/settings
router.post('/settings', async (req, res) => {
  try {
    const { max_active_bookings, max_booking_hours, max_advance_days } = req.body;

    if (max_active_bookings) {
      await dbAsync.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('max_active_bookings', ?)", [String(max_active_bookings)]);
    }
    if (max_booking_hours) {
      await dbAsync.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('max_booking_hours', ?)", [String(max_booking_hours)]);
    }
    if (max_advance_days) {
      await dbAsync.run("INSERT OR REPLACE INTO settings (key, value) VALUES ('max_advance_days', ?)", [String(max_advance_days)]);
    }

    res.json({ message: 'Settings saved successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update settings.' });
  }
});

module.exports = router;
