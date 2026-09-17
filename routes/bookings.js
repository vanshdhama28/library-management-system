const express = require('express');
const router = express.Router();
const { dbAsync } = require('../database');
const { verifyToken } = require('../middleware/auth');

// Helper to generate unique booking reference code
function generateBookingRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let result = 'BK-';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// POST /api/bookings - Book a slot for a book
router.post('/', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { book_id, booking_date, start_time, end_time } = req.body;

    if (!book_id || !booking_date || !start_time || !end_time) {
      return res.status(400).json({ error: 'Book ID, booking date, start time, and end time are required.' });
    }

    if (start_time >= end_time) {
      return res.status(400).json({ error: 'Start time must be strictly before end time.' });
    }

    // Fetch system settings
    const maxActiveSetting = await dbAsync.get("SELECT value FROM settings WHERE key = 'max_active_bookings'");
    const maxHoursSetting = await dbAsync.get("SELECT value FROM settings WHERE key = 'max_booking_hours'");
    const maxAdvanceSetting = await dbAsync.get("SELECT value FROM settings WHERE key = 'max_advance_days'");

    const maxActiveBookings = parseInt(maxActiveSetting?.value || '3', 10);
    const maxBookingHours = parseInt(maxHoursSetting?.value || '4', 10);
    const maxAdvanceDays = parseInt(maxAdvanceSetting?.value || '14', 10);

    // 1. Calculate duration in hours
    const [startH, startM] = start_time.split(':').map(Number);
    const [endH, endM] = end_time.split(':').map(Number);
    const durationHours = (endH + endM / 60) - (startH + startM / 60);

    if (durationHours > maxBookingHours) {
      return res.status(400).json({ error: `Booking duration cannot exceed ${maxBookingHours} hours.` });
    }

    // 2. Validate booking date range
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const targetDate = new Date(booking_date + 'T00:00:00');
    
    if (isNaN(targetDate.getTime())) {
      return res.status(400).json({ error: 'Invalid booking date format.' });
    }

    if (targetDate < today) {
      return res.status(400).json({ error: 'Cannot book slots in the past.' });
    }

    const maxAllowedDate = new Date(today);
    maxAllowedDate.setDate(maxAllowedDate.getDate() + maxAdvanceDays);
    if (targetDate > maxAllowedDate) {
      return res.status(400).json({ error: `Bookings can only be made up to ${maxAdvanceDays} days in advance.` });
    }

    // 3. Check user's current active bookings count
    const userActiveCount = await dbAsync.get(
      `SELECT COUNT(*) as count FROM bookings 
       WHERE user_id = ? AND status IN ('confirmed', 'checked_out')`,
      [userId]
    );

    if (userActiveCount.count >= maxActiveBookings) {
      return res.status(400).json({ 
        error: `You have reached your maximum active bookings limit (${maxActiveBookings}). Please cancel or complete an existing booking first.` 
      });
    }

    // 4. Fetch target book and verify existence
    const book = await dbAsync.get('SELECT * FROM books WHERE id = ?', [book_id]);
    if (!book) {
      return res.status(404).json({ error: 'Book not found.' });
    }

    // 5. DOUBLE-BOOKING CONFLICT CHECK
    // Find how many active bookings for this book overlap with requested [start_time, end_time] on booking_date
    // Overlap condition: (existing.start_time < req.end_time AND existing.end_time > req.start_time)
    const overlappingBookings = await dbAsync.get(
      `SELECT COUNT(*) as count FROM bookings
       WHERE book_id = ? 
         AND booking_date = ? 
         AND status IN ('confirmed', 'checked_out')
         AND (start_time < ? AND end_time > ?)`,
      [book_id, booking_date, end_time, start_time]
    );

    if (overlappingBookings.count >= book.total_copies) {
      return res.status(409).json({
        error: `Sorry! All ${book.total_copies} ${book.total_copies === 1 ? 'copy' : 'copies'} of "${book.title}" are already booked for the selected time slot (${start_time} - ${end_time}). Please choose another time or date.`
      });
    }

    // 6. Create booking
    const bookingRef = generateBookingRef();
    const result = await dbAsync.run(
      `INSERT INTO bookings (booking_ref, user_id, book_id, booking_date, start_time, end_time, status)
       VALUES (?, ?, ?, ?, ?, ?, 'confirmed')`,
      [bookingRef, userId, book_id, booking_date, start_time, end_time]
    );

    const createdBooking = await dbAsync.get(
      `SELECT b.*, bk.title as book_title, bk.author as book_author, bk.cover_url
       FROM bookings b
       JOIN books bk ON b.book_id = bk.id
       WHERE b.id = ?`,
      [result.id]
    );

    res.status(201).json({
      message: 'Slot booked successfully!',
      booking: createdBooking
    });

  } catch (err) {
    console.error('Create booking error:', err);
    res.status(500).json({ error: 'Failed to complete slot booking.' });
  }
});

// GET /api/bookings/my - Get user's own bookings
router.get('/my', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const bookings = await dbAsync.all(
      `SELECT b.*, bk.title as book_title, bk.author as book_author, bk.cover_url, bk.isbn, bk.category
       FROM bookings b
       JOIN books bk ON b.book_id = bk.id
       WHERE b.user_id = ?
       ORDER BY b.booking_date DESC, b.start_time DESC`,
      [userId]
    );

    res.json({ bookings });
  } catch (err) {
    console.error('Fetch my bookings error:', err);
    res.status(500).json({ error: 'Failed to retrieve your bookings.' });
  }
});

// DELETE /api/bookings/:id/cancel - Cancel a booking
router.delete('/:id/cancel', verifyToken, async (req, res) => {
  try {
    const bookingId = req.params.id;
    const userId = req.user.id;

    const booking = await dbAsync.get('SELECT * FROM bookings WHERE id = ?', [bookingId]);
    if (!booking) {
      return res.status(404).json({ error: 'Booking not found.' });
    }

    // Only owner or admin can cancel
    if (booking.user_id !== userId && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You are not authorized to cancel this booking.' });
    }

    if (booking.status === 'cancelled') {
      return res.status(400).json({ error: 'Booking is already cancelled.' });
    }

    await dbAsync.run("UPDATE bookings SET status = 'cancelled' WHERE id = ?", [bookingId]);

    res.json({ message: 'Booking cancelled successfully.' });
  } catch (err) {
    console.error('Cancel booking error:', err);
    res.status(500).json({ error: 'Failed to cancel booking.' });
  }
});

module.exports = router;
