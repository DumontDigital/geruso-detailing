/* Geruso Detailing — Shared customer page nav & footer renderer */

(function () {
  const NAV_LINKS = [
    { href: '/home.html',     label: 'Home' },
    { href: '/services.html', label: 'Services' },
    { href: '/work.html',     label: 'Our Work' },
    { href: '/schedule.html', label: 'Schedule' },
    { href: '/reviews.html',  label: 'Reviews' },
    { href: '/contact.html',  label: 'Contact' },
  ];

  function renderNav(activePage) {
    const links = NAV_LINKS.map(l => {
      const isActive = activePage && (l.href.includes(activePage));
      return `<li><a href="${l.href}" class="${isActive ? 'active' : ''}">${l.label}</a></li>`;
    }).join('');

    return `
      <nav class="nav">
        <a href="/home.html" class="nav-brand">
          <img src="/logo.png" alt="Geruso Detailing">
          <div class="nav-brand-text">
            <span class="nav-brand-name">Geruso Detailing</span>
            <span class="nav-brand-sub">Premium Auto Care</span>
          </div>
        </a>
        <input type="checkbox" id="navToggle" class="nav-toggle">
        <label for="navToggle" class="nav-toggle-label">
          <span></span><span></span><span></span>
        </label>
        <ul class="nav-links">
          ${links}
          <li><a href="/login" class="nav-signin">Sign In</a></li>
          <li>
            <button type="button" id="cartBtn" class="nav-cart is-empty" aria-label="View cart">
              <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <circle cx="9" cy="21" r="1"></circle>
                <circle cx="20" cy="21" r="1"></circle>
                <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6"></path>
              </svg>
              <span class="cart-label">Cart</span>
              <span class="cart-count">0</span>
            </button>
          </li>
        </ul>
      </nav>
    `;
  }

  function renderFooter() {
    const year = new Date().getFullYear();
    return `
      <footer class="footer">
        <div class="footer-inner">
          <div class="footer-brand">
            <h3>Geruso Detailing</h3>
            <p>Professional mobile car detailing in Rhode Island. We come to you with showroom-quality results.</p>
          </div>
          <div class="footer-col">
            <h4>Explore</h4>
            <ul>
              <li><a href="/home.html">Home</a></li>
              <li><a href="/services.html">Services</a></li>
              <li><a href="/work.html">Our Work</a></li>
              <li><a href="/reviews.html">Reviews</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h4>Booking</h4>
            <ul>
              <li><a href="/booking.html">Book Service</a></li>
              <li><a href="/schedule.html">Hours</a></li>
              <li><a href="/contact.html">Contact</a></li>
            </ul>
          </div>
          <div class="footer-col">
            <h4>Contact</h4>
            <ul>
              <li><a href="tel:401-490-1236">(401) 490-1236</a></li>
              <li><a href="mailto:dumontdigital1@gmail.com">Email Us</a></li>
              <li>Rhode Island</li>
            </ul>
          </div>
        </div>
        <div class="footer-bottom">
          &copy; ${year} Geruso Detailing. All rights reserved.
        </div>
      </footer>
    `;
  }

  // Auto-mount on DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    const navMount = document.querySelector('[data-nav]');
    const footerMount = document.querySelector('[data-footer]');
    const activePage = document.body.dataset.page || '';
    if (navMount) navMount.outerHTML = renderNav(activePage);
    if (footerMount) footerMount.outerHTML = renderFooter();
  });

  window.GerusoShell = { renderNav, renderFooter };
})();
