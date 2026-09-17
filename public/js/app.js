// Shared App Utilities & Auth state management

const App = {
  getToken: () => localStorage.getItem('lib_token'),
  setToken: (token) => localStorage.setItem('lib_token', token),
  clearAuth: () => {
    localStorage.removeItem('lib_token');
    localStorage.removeItem('lib_user');
  },
  getUser: () => {
    const raw = localStorage.getItem('lib_user');
    return raw ? JSON.parse(raw) : null;
  },
  setUser: (user) => localStorage.setItem('lib_user', JSON.stringify(user)),

  // Robust API Call Wrapper with Safe Error Handling
  async api(endpoint, method = 'GET', body = null) {
    const token = App.getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const config = { method, headers };
    if (body) {
      config.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(`/api${endpoint}`, config);
      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = { error: text || `Server error (${response.status})` };
      }

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          if (endpoint.includes('/my') || endpoint.includes('/admin')) {
            App.clearAuth();
            window.location.href = '/login.html';
          }
        }
        throw new Error(data.error || `API Request failed with status ${response.status}`);
      }
      return data;
    } catch (err) {
      console.error(`API Error [${endpoint}]:`, err);
      throw err;
    }
  },

  // Toast Notification System
  showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'fixed top-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full px-4 pointer-events-none';
      document.body.appendChild(container);
    }

    const bgMap = {
      success: 'bg-emerald-600 border-emerald-500 text-white',
      error: 'bg-rose-600 border-rose-500 text-white',
      info: 'bg-indigo-600 border-indigo-500 text-white',
      warning: 'bg-amber-600 border-amber-500 text-white'
    };

    const iconMap = {
      success: 'fa-check-circle',
      error: 'fa-exclamation-circle',
      info: 'fa-info-circle',
      warning: 'fa-triangle-exclamation'
    };

    const toast = document.createElement('div');
    toast.className = `toast pointer-events-auto flex items-center gap-3 p-4 rounded-xl shadow-2xl border text-sm font-medium ${bgMap[type] || bgMap.info}`;
    toast.innerHTML = `
      <i class="fa-solid ${iconMap[type]} text-lg"></i>
      <span class="flex-1">${message}</span>
      <button onclick="this.parentElement.remove()" class="text-white/80 hover:text-white p-1">
        <i class="fa-solid fa-xmark"></i>
      </button>
    `;

    container.appendChild(toast);
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 4500);
  },

  renderNav() {
    const navRight = document.getElementById('nav-right');
    if (!navRight) return;

    const user = App.getUser();
    if (user) {
      navRight.innerHTML = `
        <div class="flex items-center gap-3">
          <span class="hidden md:inline-block text-xs font-semibold px-2.5 py-1 rounded-full ${user.role === 'admin' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'} uppercase tracking-wider">
            ${user.role}
          </span>
          <a href="${user.role === 'admin' ? '/admin.html' : '/dashboard.html'}" class="flex items-center gap-2 text-slate-200 hover:text-white transition font-medium text-sm">
            <div class="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center font-bold text-white shadow-md">
              ${user.name.charAt(0).toUpperCase()}
            </div>
            <span class="hidden sm:inline">${user.name}</span>
          </a>
          <button id="logout-btn" onclick="App.logout()" class="ml-2 px-3 py-1.5 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition flex items-center gap-1.5">
            <i class="fa-solid fa-right-from-bracket"></i>
            <span>Logout</span>
          </button>
        </div>
      `;
    } else {
      navRight.innerHTML = `
        <div class="flex items-center gap-3">
          <a href="/login.html" class="px-4 py-2 rounded-xl text-sm font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition">
            Sign In
          </a>
          <a href="/login.html?tab=register" class="px-4 py-2 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/30 transition">
            Get Started
          </a>
        </div>
      `;
    }
  },

  logout() {
    App.clearAuth();
    App.showToast('Logged out successfully', 'info');
    setTimeout(() => {
      window.location.href = '/login.html';
    }, 500);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  App.renderNav();
});
