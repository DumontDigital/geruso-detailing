/**
 * Authentication Helper - Unified auth for all views
 * Handles token management, role checking, and redirects
 */

class AuthHelper {
  constructor() {
    this.token = this.getBestToken();
    this.user = this.getUser();
    if ((!this.user || !this.user.role) && this.token) {
      const payload = this.getTokenPayload(this.token);
      if (payload) {
        this.user = {
          id: payload.id,
          email: payload.email,
          role: payload.role
        };
        localStorage.setItem('user', JSON.stringify(this.user));
      }
    }
    if (this.token) {
      localStorage.setItem('token', this.token);
    }
  }

  getUser() {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  }

  getTokenPayload(token) {
    try {
      if (!token || !token.includes('.')) return null;
      const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(payload));
    } catch (error) {
      return null;
    }
  }

  isFreshToken(token) {
    const payload = this.getTokenPayload(token);
    return !!payload && (!payload.exp || payload.exp * 1000 > Date.now());
  }

  isFreshStaffToken(token) {
    const payload = this.getTokenPayload(token);
    return !!payload
      && (payload.role === 'owner' || payload.role === 'dev')
      && (!payload.exp || payload.exp * 1000 > Date.now());
  }

  getBestToken() {
    const candidates = [
      localStorage.getItem('token'),
      localStorage.getItem('adminToken'),
      localStorage.getItem('ownerToken')
    ].filter(Boolean);

    return candidates.find((candidate) => this.isFreshStaffToken(candidate))
      || candidates.find((candidate) => this.isFreshToken(candidate))
      || candidates[0]
      || null;
  }

  isLoggedIn() {
    return !!this.token && !!this.user;
  }

  getRole() {
    return this.user?.role || null;
  }

  hasRole(requiredRole) {
    const role = this.getRole();
    if (typeof requiredRole === 'string') {
      return role === requiredRole;
    }
    return requiredRole.includes(role);
  }

  /**
   * Check if user is authenticated and has correct role
   * If not, redirect to login
   */
  requireAuth(allowedRoles = []) {
    if (!this.isLoggedIn()) {
      window.location.href = '/login';
      return false;
    }

    if (allowedRoles.length > 0) {
      if (!this.hasRole(allowedRoles)) {
        alert('You do not have permission to access this page');
        window.location.href = '/login';
        return false;
      }
    }

    return true;
  }

  /**
   * Make authenticated API request
   */
  async apiCall(url, options = {}) {
    this.token = this.getBestToken();
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.token}`,
      ...options.headers
    };

    const response = await fetch(url, {
      ...options,
      headers
    });

    // If unauthorized, logout and redirect
    if (response.status === 401) {
      this.logout();
      window.location.href = '/login';
      return null;
    }

    return response;
  }

  /**
   * Get auth headers for fetch requests
   */
  getAuthHeaders() {
    this.token = this.getBestToken();
    if (this.token) {
      localStorage.setItem('token', this.token);
    }
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Logout and redirect to login
   */
  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('adminToken');
    localStorage.removeItem('ownerToken');
    localStorage.removeItem('user');
    window.location.href = '/login';
  }

  /**
   * Display user info
   */
  getUserDisplay() {
    if (!this.user) return 'Guest';
    return `${this.user.first_name || ''} ${this.user.last_name || ''}`.trim() || this.user.email;
  }

  /**
   * Update user info after logout button is clicked
   */
  setupLogoutButton(buttonSelector) {
    const btn = document.querySelector(buttonSelector);
    if (btn) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (confirm('Are you sure you want to logout?')) {
          this.logout();
        }
      });
    }
  }

  /**
   * Show user info in header
   */
  displayUserInfo(elementSelector) {
    const el = document.querySelector(elementSelector);
    if (el && this.user) {
      el.textContent = this.getUserDisplay();
      el.title = this.user.email;
    }
  }
}

// Export for use in other files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AuthHelper;
}
