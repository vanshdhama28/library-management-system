// User Dashboard Logic

let myBookings = [];
let currentFilter = 'active';

document.addEventListener('DOMContentLoaded', () => {
  const user = App.getUser();
  if (!user) {
    window.location.href = '/login.html';
    return;
  }

  // Populate user header
  document.getElementById('user-name-display').textContent = `${user.name}'s Dashboard`;
  document.getElementById('user-email-display').textContent = user.email;
  document.getElementById('user-avatar').textContent = user.name.charAt(0).toUpperCase();

  loadMyBookings();
});

async function loadMyBookings() {
  const container = document.getElementById('my-bookings-container');
  try {
    const data = await App.api('/bookings/my');
    myBookings = data.bookings;

    updateStats();
    renderBookings();
  } catch (err) {
    container.innerHTML = `
      <div class="py-12 text-center text-rose-400">
        <i class="fa-solid fa-circle-exclamation text-3xl mb-2"></i>
        <p class="text-sm">Failed to load your bookings: ${err.message}</p>
      </div>
    `;
  }
}

function updateStats() {
  const activeCount = myBookings.filter(b => b.status === 'confirmed' || b.status === 'checked_out').length;
  document.getElementById('stat-active').textContent = activeCount;
  document.getElementById('stat-total').textContent = myBookings.length;
}

function filterMyBookings(filter) {
  currentFilter = filter;
  const activeBtn = document.getElementById('tab-active');
  const allBtn = document.getElementById('tab-all');

  if (filter === 'active') {
    activeBtn.className = 'px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white transition shadow-sm';
    allBtn.className = 'px-3.5 py-1.5 rounded-lg text-slate-400 hover:text-white transition';
  } else {
    allBtn.className = 'px-3.5 py-1.5 rounded-lg bg-indigo-600 text-white transition shadow-sm';
    activeBtn.className = 'px-3.5 py-1.5 rounded-lg text-slate-400 hover:text-white transition';
  }

  renderBookings();
}

function renderBookings() {
  const container = document.getElementById('my-bookings-container');

  let filtered = myBookings;
  if (currentFilter === 'active') {
    filtered = myBookings.filter(b => b.status === 'confirmed' || b.status === 'checked_out');
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="py-12 text-center text-slate-400">
        <i class="fa-solid fa-calendar-xmark text-4xl text-slate-600 mb-3"></i>
        <p class="text-base font-semibold text-white">No ${currentFilter === 'active' ? 'active' : ''} bookings found</p>
        <p class="text-xs text-slate-400 mt-1">Browse the library catalog to book your first book slot!</p>
        <a href="/" class="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-500 transition shadow-md">
          <i class="fa-solid fa-compass"></i> Go to Catalog
        </a>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(b => {
    let statusBadge = '';
    if (b.status === 'confirmed') {
      statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"><i class="fa-solid fa-circle-check mr-1"></i> Reserved</span>`;
    } else if (b.status === 'checked_out') {
      statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-sky-500/15 text-sky-400 border border-sky-500/30"><i class="fa-solid fa-book-reader mr-1"></i> In Use / Checked Out</span>`;
    } else if (b.status === 'completed') {
      statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-500/15 text-indigo-300 border border-indigo-500/30"><i class="fa-solid fa-check-double mr-1"></i> Completed</span>`;
    } else {
      statusBadge = `<span class="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30"><i class="fa-solid fa-xmark mr-1"></i> Cancelled</span>`;
    }

    const formattedDate = new Date(b.booking_date + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'
    });

    const isUpcoming = b.status === 'confirmed';

    return `
      <div class="glass-panel p-5 rounded-2xl border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 hover:border-slate-700 transition">
        <div class="flex items-center gap-4">
          <img src="${b.cover_url}" alt="${b.book_title}" 
            class="w-16 h-24 object-cover rounded-xl shadow-md border border-slate-700 bg-slate-900 shrink-0"
            onerror="this.src='https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&w=400&q=80'">
          
          <div>
            <div class="flex flex-wrap items-center gap-2 mb-1">
              <span class="font-mono text-[11px] font-extrabold px-2 py-0.5 rounded bg-slate-800 text-indigo-300 border border-slate-700">
                ${b.booking_ref}
              </span>
              ${statusBadge}
            </div>

            <h3 class="text-base font-bold text-white line-clamp-1">${b.book_title}</h3>
            <p class="text-xs text-slate-400 mt-0.5"><i class="fa-solid fa-feather-pointed mr-1"></i> ${b.book_author}</p>

            <div class="flex flex-wrap items-center gap-4 mt-3 text-xs text-slate-300">
              <span class="flex items-center gap-1.5 font-semibold text-indigo-300">
                <i class="fa-regular fa-calendar text-indigo-400"></i> ${formattedDate}
              </span>
              <span class="flex items-center gap-1.5 font-semibold text-sky-300">
                <i class="fa-regular fa-clock text-sky-400"></i> ${b.start_time} - ${b.end_time}
              </span>
            </div>
          </div>
        </div>

        <!-- Action & QR Ticket Badge -->
        <div class="flex items-center gap-3 w-full md:w-auto justify-end pt-4 md:pt-0 border-t md:border-t-0 border-slate-800">
          <button onclick="showTicket('${b.booking_ref}', '${b.book_title.replace(/'/g, "\\'")}', '${formattedDate}', '${b.start_time} - ${b.end_time}')" 
            class="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 transition flex items-center gap-1.5">
            <i class="fa-solid fa-qrcode text-indigo-400"></i> Ticket Code
          </button>

          ${isUpcoming ? `
            <button onclick="cancelBooking(${b.id})" 
              class="px-3.5 py-2 rounded-xl text-xs font-bold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition flex items-center gap-1.5">
              <i class="fa-solid fa-trash-can"></i> Cancel Slot
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

async function cancelBooking(bookingId) {
  if (!confirm('Are you sure you want to cancel this slot booking? The slot will immediately become available for others.')) {
    return;
  }

  try {
    const data = await App.api(`/bookings/${bookingId}/cancel`, 'DELETE');
    App.showToast(data.message, 'success');
    loadMyBookings();
  } catch (err) {
    App.showToast(err.message, 'error');
  }
}

function showTicket(ref, bookTitle, date, time) {
  alert(`🎟️ BOOKING VERIFICATION TICKET\n-----------------------------------\nRef Code: ${ref}\nBook: ${bookTitle}\nDate: ${date}\nTime Slot: ${time}\n-----------------------------------\nShow this code at the library front desk upon arrival.`);
}
