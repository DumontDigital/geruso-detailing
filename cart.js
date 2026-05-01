/**
 * Geruso Detailing Cart Management
 * Client-side cart system using localStorage
 */

const CART_STORAGE_KEY = 'gerusoCart';

/**
 * Get the entire cart from localStorage
 */
function getCart() {
  const cart = localStorage.getItem(CART_STORAGE_KEY);
  return cart ? JSON.parse(cart) : { items: [] };
}

/**
 * Save cart to localStorage
 */
function saveCart(cart) {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
}

/**
 * Add a service to the cart
 */
function addToCart(serviceName, price) {
  const cart = getCart();

  // Check if item already in cart
  const existingItem = cart.items.find(item => item.serviceName === serviceName);
  if (existingItem) {
    existingItem.quantity = (existingItem.quantity || 1) + 1;
  } else {
    cart.items.push({
      id: Math.random().toString(36).substr(2, 9),
      serviceName: serviceName,
      price: parseFloat(price),
      addedAt: new Date().toISOString()
    });
  }

  saveCart(cart);
  updateNavCartBadge();
  return cart;
}

/**
 * Remove a service from the cart by ID
 */
function removeFromCart(itemId) {
  const cart = getCart();
  cart.items = cart.items.filter(item => item.id !== itemId);
  saveCart(cart);
  updateNavCartBadge();
  return cart;
}

/**
 * Get number of items in cart
 */
function getCartCount() {
  const cart = getCart();
  return cart.items.length;
}

/**
 * Get total price of all cart items
 */
function getCartTotal() {
  const cart = getCart();
  return cart.items.reduce((total, item) => total + item.price, 0).toFixed(2);
}

/**
 * Clear the entire cart
 */
function clearCart() {
  localStorage.removeItem(CART_STORAGE_KEY);
  updateNavCartBadge();
}

/**
 * Update the cart count badge in navbar
 */
function updateNavCartBadge() {
  const count = getCartCount();
  const badges = document.querySelectorAll('#cartCount');
  badges.forEach(badge => {
    badge.textContent = count;
    // Hide count if 0
    if (count === 0) {
      badge.parentElement.style.display = 'none';
    } else {
      badge.parentElement.style.display = 'inline';
    }
  });
}

/**
 * Toggle cart modal visibility
 */
function toggleCartModal() {
  const modal = document.getElementById('cartModal');
  if (!modal) return;

  if (modal.style.display === 'none' || !modal.style.display) {
    modal.style.display = 'block';
    updateCartModalDisplay();
  } else {
    modal.style.display = 'none';
  }
}

/**
 * Update cart modal with current items
 */
function updateCartModalDisplay() {
  const cart = getCart();
  const itemsContainer = document.getElementById('cartItems');
  const totalSpan = document.getElementById('cartTotal');

  if (!itemsContainer) return;

  if (cart.items.length === 0) {
    itemsContainer.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">Your cart is empty</p>';
    if (totalSpan) totalSpan.textContent = '0';
    return;
  }

  let html = '';
  cart.items.forEach(item => {
    html += `
      <div class="cart-item" style="display: flex; justify-content: space-between; align-items: center; padding: 12px; border-bottom: 1px solid var(--border);">
        <div style="flex: 1;">
          <div style="font-weight: 600; color: var(--text);">${item.serviceName}</div>
          <div style="font-size: 13px; color: var(--text-muted);">$${item.price.toFixed(2)}</div>
        </div>
        <button onclick="removeFromCart('${item.id}'); updateCartModalDisplay(); updateNavCartBadge();"
                style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 0 8px; font-size: 18px;">
          ×
        </button>
      </div>
    `;
  });

  itemsContainer.innerHTML = html;

  if (totalSpan) {
    totalSpan.textContent = getCartTotal();
  }
}

/**
 * Initialize cart functionality on page load
 */
function initializeCart() {
  // Update badge on load
  updateNavCartBadge();

  // Setup cart button click handler
  const cartBtn = document.getElementById('cartBtn');
  if (cartBtn) {
    cartBtn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleCartModal();
    });
  }

  // Setup checkout button click handler
  const checkoutBtn = document.getElementById('checkoutBtn');
  if (checkoutBtn) {
    checkoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      proceedToCheckout();
    });
  }

  // Setup close cart modal button
  const closeCartBtn = document.getElementById('closeCart');
  if (closeCartBtn) {
    closeCartBtn.addEventListener('click', () => {
      const modal = document.getElementById('cartModal');
      if (modal) modal.style.display = 'none';
    });
  }

  // Close modal when clicking outside
  const cartModal = document.getElementById('cartModal');
  if (cartModal) {
    cartModal.addEventListener('click', (e) => {
      if (e.target === cartModal) {
        cartModal.style.display = 'none';
      }
    });
  }
}

/**
 * Proceed to checkout
 */
function proceedToCheckout() {
  const count = getCartCount();

  // Check if cart is empty
  if (count === 0) {
    alert('Your cart is empty! Please add services before checking out.');
    return;
  }

  // Redirect to booking page
  window.location.href = '/booking?fromCart=true';
}

// Auto-initialize on DOMContentLoaded if not already initialized
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    if (!window.cartInitialized) {
      initializeCart();
      window.cartInitialized = true;
    }
  });
} else {
  // Already loaded
  if (!window.cartInitialized) {
    initializeCart();
    window.cartInitialized = true;
  }
}
