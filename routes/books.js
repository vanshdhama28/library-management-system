const express = require('express');
const router = express.Router();
const { dbAsync } = require('../database');

// GET /api/books - List all books with optional search & category filter & date availability summary
router.get('/', async (req, res) => {
  try {
    const { search, category, date } = req.query;
    let query = 'SELECT * FROM books WHERE 1=1';
    const params = [];

    if (search) {
      query += ' AND (title LIKE ? OR author LIKE ? OR isbn LIKE ?)';
      const term = `%${search.trim()}%`;
      params.push(term, term, term);
    }

    if (category && category !== 'All') {
      query += ' AND category = ?';
      params.push(category);
    }

    query += ' ORDER BY title ASC';
    const books = await dbAsync.all(query, params);

    // If date provided, compute live availability for each book
    const checkDate = date || new Date().toISOString().split('T')[0];
    
    // Fetch active bookings for the specified date
    const activeBookings = await dbAsync.all(
      `SELECT book_id, COUNT(*) as booked_count 
       FROM bookings 
       WHERE booking_date = ? AND status IN ('confirmed', 'checked_out')
       GROUP BY book_id`,
      [checkDate]
    );

    const bookingMap = {};
    activeBookings.forEach(b => {
      bookingMap[b.book_id] = b.booked_count;
    });

    const booksWithAvailability = books.map(book => {
      const activeCount = bookingMap[book.id] || 0;
      let status = 'Available';
      if (activeCount >= book.total_copies) {
        status = 'Fully Booked';
      } else if (activeCount > 0) {
        status = 'Partially Booked';
      }

      return {
        ...book,
        active_bookings_on_date: activeCount,
        available_copies_now: Math.max(0, book.total_copies - activeCount),
        status_on_date: status,
        check_date: checkDate
      };
    });

    // Get categories list
    const categoriesRaw = await dbAsync.all('SELECT DISTINCT category FROM books ORDER BY category ASC');
    const categories = categoriesRaw.map(c => c.category);

    res.json({ books: booksWithAvailability, categories, selected_date: checkDate });
  } catch (err) {
    console.error('Fetch books error:', err);
    res.status(500).json({ error: 'Failed to retrieve books.' });
  }
});

// GET /api/books/:id - Get detailed book info + slot schedule for a specific date
router.get('/:id', async (req, res) => {
  try {
    const bookId = req.params.id;
    const date = req.query.date || new Date().toISOString().split('T')[0];

    const book = await dbAsync.get('SELECT * FROM books WHERE id = ?', [bookId]);
    if (!book) {
      return res.status(404).json({ error: 'Book not found.' });
    }

    // Get all confirmed/checked_out bookings for this book on the given date
    const bookings = await dbAsync.all(
      `SELECT id, booking_ref, start_time, end_time, status, user_id
       FROM bookings 
       WHERE book_id = ? AND booking_date = ? AND status IN ('confirmed', 'checked_out')
       ORDER BY start_time ASC`,
      [bookId, date]
    );

    // Generate standard operating hours (e.g. 08:00 to 20:00) with occupancy calculation
    const timeSlots = [];
    const startHour = 8;
    const endHour = 20;

    for (let h = startHour; h < endHour; h++) {
      const slotStart = `${h.toString().padStart(2, '0')}:00`;
      const slotEnd = `${(h + 1).toString().padStart(2, '0')}:00`;

      // Count how many copies are booked during this specific hour slot
      const overlappingCount = bookings.filter(b => {
        return (slotStart < b.end_time && slotEnd > b.start_time);
      }).length;

      const availableCopies = Math.max(0, book.total_copies - overlappingCount);

      timeSlots.push({
        start_time: slotStart,
        end_time: slotEnd,
        display: `${slotStart} - ${slotEnd}`,
        booked_copies: overlappingCount,
        available_copies: availableCopies,
        is_available: availableCopies > 0
      });
    }

    res.json({
      book,
      date,
      existing_bookings: bookings,
      time_slots: timeSlots
    });
  } catch (err) {
    console.error('Fetch book detail error:', err);
    res.status(500).json({ error: 'Failed to retrieve book details.' });
  }
});

module.exports = router;
