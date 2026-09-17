// Admin Dashboard Control JS

let adminBooks = [];
let adminBookings = [];
let adminUsers = [];
let currentAdminTab = 'books';

document.addEventListener('DOMContentLoaded', () => {
  const user = App.getUser();
  if (!user || user.role !== 'admin') {
    App.showToast('Access restricted to Administrators only.', 'error');
    setTimeout(() => {
      window.location.href = '/login.html';
    }, 800);
    return;
  }

  loadAdminStats();
  loadAdminBooks();
  loadAdminBookings();
  loadAdminUsers();
  loadAdminSettings();
});

async function loadAdminStats() {
  try {
    const data = await App.api('/admin/stats');
    document.getElementById('stat-books-count').textContent = data.total_books;
    document.getElementById('stat-copies-count').textContent = `${data.total_copies} total copies`;
    document.getElementById('stat-active-bookings').textContent = data.active_bookings;
    document.getElementById('stat-today-bookings').textContent = `${data.today_bookings} today`;
    document.getElementById('stat-users-count').textContent = data.total_users;
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

function switchAdminTab(tab) {
  currentAdminTab = tab;
  const tabs = ['books', 'bookings', 'users', 'settings'];

  tabs.forEach(t => {
    const btn = document.getElementById(`admin-tab-${t}`);
    const panel = document.getElementById(`panel-${t}`);
    
    if (t === tab) {
      btn.className = 'px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 bg-indigo-600 text-white shadow-md';
      panel.classList.remove('hidden');
    } else {
      btn.className = 'px-4 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700';
      panel.classList.add('hidden');
    }
  });
}

// --- 1. BOOKS MANAGEMENT (CRUD) ---

async function loadAdminBooks() {
  try {
    const data = await App.api('/books');
    adminBooks = data.books;
    renderAdminBooks(adminBooks);
  } catch (err) {
    App.showToast('Failed to load books for admin: ' + err.message, 'error');
  }
}

function renderAdminBooks(books) {
  const tbody = document.getElementById('admin-books-tbody');
  if (books.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="px-4 py-8 text-center text-slate-500">No books found in catalog.</td></tr>`;
    return;
  }

  tbody.innerHTML = books.map(b => `
    <tr class="hover:bg-slate-900/50 transition">
      <td class="px-4 py-3">
        <div class="flex items-center gap-3">
          <img src="${b.cover_url}" alt="${b.title}" class="w-10 h-14 object-cover rounded-lg bg-slate-800 border border-slate-700 shrink-0"
            onerror="this.src='https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&w=400&q=80'">
          <div>
            <span class="font-bold text-white block line-clamp-1">${b.title}</span>
            <span class="text-slate-400 block text-[11px]">${b.author}</span>
          </div>
        </div>
      </td>
      <td class="px-4 py-3"><span class="px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700 font-semibold">${b.category}</span></td>
      <td class="px-4 py-3 font-mono text-slate-400">${b.isbn}</td>
      <td class="px-4 py-3 text-center font-bold text-white">${b.total_copies}</td>
      <td class="px-4 py-3 text-right">
        <div class="flex items-center justify-end gap-2">
          <button onclick="openEditBookModal(${b.id})" class="p-2 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-400 transition" title="Edit Book">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button onclick="deleteBook(${b.id})" class="p-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 transition" title="Delete Book">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function filterAdminBooks() {
  const search = document.getElementById('admin-book-search').value.toLowerCase();
  const filtered = adminBooks.filter(b => 
    b.title.toLowerCase().includes(search) || 
    b.author.toLowerCase().includes(search) || 
    b.isbn.toLowerCase().includes(search)
  );
  renderAdminBooks(filtered);
}

function openAddBookModal() {
  document.getElementById('book-modal-title').textContent = 'Add New Book to Inventory';
  document.getElementById('book-form-id').value = '';
  document.getElementById('book-modal-form').reset();
  
  const modal = document.getElementById('book-form-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function openEditBookModal(bookId) {
  const book = adminBooks.find(b => b.id === bookId);
  if (!book) return;

  document.getElementById('book-modal-title').textContent = 'Edit Book Metadata';
  document.getElementById('book-form-id').value = book.id;
  document.getElementById('book-form-title').value = book.title;
  document.getElementById('book-form-author').value = book.author;
  document.getElementById('book-form-category').value = book.category;
  document.getElementById('book-form-isbn').value = book.isbn;
  document.getElementById('book-form-copies').value = book.total_copies;
  document.getElementById('book-form-description').value = book.description || '';
  document.getElementById('book-form-cover').value = book.cover_url || '';

  const modal = document.getElementById('book-form-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeBookModal() {
  const modal = document.getElementById('book-form-modal');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

async function handleBookSubmit(e) {
  e.preventDefault();
  const id = document.getElementById('book-form-id').value;
  const payload = {
    title: document.getElementById('book-form-title').value,
    author: document.getElementById('book-form-author').value,
    category: document.getElementById('book-form-category').value,
    isbn: document.getElementById('book-form-isbn').value,
    total_copies: document.getElementById('book-form-copies').value,
    description: document.getElementById('book-form-description').value,
    cover_url: document.getElementById('book-form-cover').value
  };

  try {
    let res;
    if (id) {
      res = await App.api(`/admin/books/${id}`, 'PUT', payload);
    } else {
      res = await App.api('/admin/books', 'POST', payload);
    }

    App.showToast(res.message, 'success');
    closeBookModal();
    loadAdminBooks();
    loadAdminStats();
  } catch (err) {
    App.showToast(err.message, 'error');
  }
}

async function deleteBook(bookId) {
  if (!confirm('Are you sure you want to delete this book from the library catalog? All active bookings for this book will also be removed.')) {
    return;
  }

  try {
    const res = await App.api(`/admin/books/${bookId}`, 'DELETE');
    App.showToast(res.message, 'success');
    loadAdminBooks();
    loadAdminStats();
  } catch (err) {
    App.showToast(err.message, 'error');
  }
}

// --- 2. BOOKINGS CONTROL ---

async function loadAdminBookings() {
  const statusFilter = document.getElementById('admin-booking-filter-status').value;
  try {
    const data = await App.api(`/admin/bookings?status=${statusFilter}`);
    adminBookings = data.bookings;
    renderAdminBookings(adminBookings);
  } catch (err) {
    App.showToast('Failed to load system bookings: ' + err.message, 'error');
  }
}

function renderAdminBookings(bookings) {
  const tbody = document.getElementById('admin-bookings-tbody');
  if (bookings.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="px-4 py-8 text-center text-slate-500">No bookings match criteria.</td></tr>`;
    return;
  }

  tbody.innerHTML = bookings.map(b => `
    <tr class="hover:bg-slate-900/50 transition">
      <td class="px-4 py-3 font-mono font-bold text-indigo-300">${b.booking_ref}</td>
      <td class="px-4 py-3">
        <span class="font-bold text-white block">${b.user_name}</span>
        <span class="text-slate-400 block text-[11px]">${b.user_email}</span>
      </td>
      <td class="px-4 py-3 font-semibold text-slate-200 line-clamp-1">${b.book_title}</td>
      <td class="px-4 py-3">
        <span class="block text-slate-200 font-medium">${b.booking_date}</span>
        <span class="block text-sky-400 text-[11px]">${b.start_time} - ${b.end_time}</span>
      </td>
      <td class="px-4 py-3">
        <span class="capitalize px-2 py-0.5 rounded text-[11px] font-bold ${getAdminStatusBadgeClass(b.status)}">
          ${b.status.replace('_', ' ')}
        </span>
      </td>
      <td class="px-4 py-3 text-right">
        <select onchange="updateBookingStatus(${b.id}, this.value)" class="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-indigo-500 cursor-pointer">
          <option value="confirmed" ${b.status === 'confirmed' ? 'selected' : ''}>Confirmed / Reserved</option>
          <option value="checked_out" ${b.status === 'checked_out' ? 'selected' : ''}>Mark Checked Out</option>
          <option value="completed" ${b.status === 'completed' ? 'selected' : ''}>Mark Completed</option>
          <option value="cancelled" ${b.status === 'cancelled' ? 'selected' : ''}>Cancel Slot</option>
        </select>
      </td>
    </tr>
  `).join('');
}

function getAdminStatusBadgeClass(status) {
  switch (status) {
    case 'confirmed': return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
    case 'checked_out': return 'bg-sky-500/20 text-sky-400 border border-sky-500/30';
    case 'completed': return 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30';
    case 'cancelled': return 'bg-rose-500/20 text-rose-400 border border-rose-500/30';
    default: return 'bg-slate-800 text-slate-400';
  }
}

async function updateBookingStatus(bookingId, status) {
  try {
    const res = await App.api(`/admin/bookings/${bookingId}/status`, 'PATCH', { status });
    App.showToast(res.message, 'success');
    loadAdminBookings();
    loadAdminStats();
  } catch (err) {
    App.showToast(err.message, 'error');
  }
}

// --- 3. USER MANAGEMENT ---

async function loadAdminUsers() {
  try {
    const data = await App.api('/admin/users');
    adminUsers = data.users;
    renderAdminUsers(adminUsers);
  } catch (err) {
    App.showToast('Failed to load users: ' + err.message, 'error');
  }
}

function renderAdminUsers(users) {
  const tbody = document.getElementById('admin-users-tbody');
  tbody.innerHTML = users.map(u => `
    <tr class="hover:bg-slate-900/50 transition">
      <td class="px-4 py-3">
        <span class="font-bold text-white block">${u.name}</span>
        <span class="text-slate-400 block text-[11px]">${u.email}</span>
      </td>
      <td class="px-4 py-3">
        <span class="uppercase text-[10px] font-extrabold px-2 py-0.5 rounded ${u.role === 'admin' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-slate-800 text-slate-300'}">
          ${u.role}
        </span>
      </td>
      <td class="px-4 py-3">
        <span class="capitalize text-[11px] font-bold ${u.status === 'active' ? 'text-emerald-400' : 'text-rose-400'}">
          ● ${u.status}
        </span>
      </td>
      <td class="px-4 py-3 text-center font-semibold text-slate-300">
        ${u.active_bookings} active / ${u.total_bookings} total
      </td>
      <td class="px-4 py-3 text-right">
        <div class="flex items-center justify-end gap-2">
          <button onclick="toggleUserRole(${u.id}, '${u.role === 'admin' ? 'user' : 'admin'}')" 
            class="px-2.5 py-1 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition">
            Make ${u.role === 'admin' ? 'User' : 'Admin'}
          </button>
          <button onclick="toggleUserStatus(${u.id}, '${u.status === 'active' ? 'suspended' : 'active'}')" 
            class="px-2.5 py-1 rounded-lg text-xs font-semibold ${u.status === 'active' ? 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'} transition">
            ${u.status === 'active' ? 'Suspend' : 'Activate'}
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function toggleUserRole(userId, newRole) {
  try {
    const res = await App.api(`/admin/users/${userId}/role`, 'PATCH', { role: newRole });
    App.showToast(res.message, 'success');
    loadAdminUsers();
  } catch (err) {
    App.showToast(err.message, 'error');
  }
}

async function toggleUserStatus(userId, newStatus) {
  try {
    const res = await App.api(`/admin/users/${userId}/status`, 'PATCH', { status: newStatus });
    App.showToast(res.message, 'success');
    loadAdminUsers();
  } catch (err) {
    App.showToast(err.message, 'error');
  }
}

// --- 4. SYSTEM SETTINGS ---

async function loadAdminSettings() {
  try {
    const data = await App.api('/admin/settings');
    const s = data.settings;
    document.getElementById('setting-max-active').value = s.max_active_bookings || 3;
    document.getElementById('setting-max-hours').value = s.max_booking_hours || 4;
    document.getElementById('setting-max-advance').value = s.max_advance_days || 14;
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
}

async function saveAdminSettings(e) {
  e.preventDefault();
  const payload = {
    max_active_bookings: document.getElementById('setting-max-active').value,
    max_booking_hours: document.getElementById('setting-max-hours').value,
    max_advance_days: document.getElementById('setting-max-advance').value
  };

  try {
    const res = await App.api('/admin/settings', 'POST', payload);
    App.showToast(res.message, 'success');
  } catch (err) {
    App.showToast(err.message, 'error');
  }
}
