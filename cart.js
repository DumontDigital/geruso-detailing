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
 * Check if service categories can be mixed in cart
 */
function canAddToCart(newServiceTag) {
  const cart = getCart();

  if (cart.items.length === 0) return true; // Empty cart, can add anything

  // Get tags of existing items
  const existingTags = new Set(cart.items.map(item => item.serviceTag));

  // LOCATION ONLY cannot be mixed with MOBILE or EXTRA FEE
  const hasLocationOnly = existingTags.has('LOCATION ONLY');
  const hasMobileOrFee = existingTags.has('MOBILE') || existingTags.has('EXTRA FEE');
  const isNewLocationOnly = newServiceTag === 'LOCATION ONLY';
  const isNewMobileOrFee = newServiceTag === 'MOBILE' || newServiceTag === 'EXTRA FEE';

  if (hasLocationOnly && isNewMobileOrFee) return false;
  if (hasMobileOrFee && isNewLocationOnly) return false;

  return true;
}

/**
 * Get category conflict message
 */
function getCategoryConflictMessage(newServiceTag) {
  const cart = getCart();
  const existingTags = new Set(cart.items.map(item => item.serviceTag));
  const hasLocationOnly = existingTags.has('LOCATION ONLY');
  const hasMobileOrFee = existingTags.has('MOBILE') || existingTags.has('EXTRA FEE');

  if (hasLocationOnly && (newServiceTag === 'MOBILE' || newServiceTag === 'EXTRA FEE')) {
    return 'Mobile services cannot be combined with location-only services. Please checkout separately.';
  }
  if (hasMobileOrFee && newServiceTag === 'LOCATION ONLY') {
    return 'Location-only services cannot be combined with mobile services. Please checkout separately.';
  }
  return '';
}

/**
 * Add a service to the cart
 */
function addToCart(serviceName, price, serviceTag, serviceType) {
  // Validate service category mixing
  if (!canAddToCart(serviceTag)) {
    const message = getCategoryConflictMessage(serviceTag);
    alert(message);
    console.warn('[Cart] Service category conflict:', message);
    return false;
  }

  const cart = getCart();

  // Check if item already in cart
  const existingItem = cart.items.find(item => item.serviceName === serviceName);
  if (existingItem) {
    existingItem.quantity = (existingItem.quantity || 1) + 1;
    console.log('[Cart] Item quantity increased:', serviceName, 'New quantity:', existingItem.quantity);
  } else {
    cart.items.push({
      id: Math.random().toString(36).substr(2, 9),
      serviceName: serviceName,
      price: parseFloat(price),
      serviceTag: serviceTag || 'MOBILE', // MOBILE, LOCATION ONLY, or EXTRA FEE
      serviceType: serviceType || 'standard', // For future use
      quantity: 1,
      addedAt: new Date().toISOString()
    });
    console.log('[Cart] Item added:', serviceName, 'Price:', price, 'Tag:', serviceTag);
  }

  saveCart(cart);
  updateNavCartBadge();
  return true;
}

/**
 * Remove a service from the cart by ID
 */
function removeFromCart(itemId) {
  const cart = getCart();
  cart.items = cart.items.filter(item => item.id !== itemId);
  saveCart(cart);
  updateNavCartBadge();
  updateCartModalDisplay();
  console.log('[Cart] Item removed:', itemId);
  return cart;
}

/**
 * Increase quantity of an item in cart
 */
function increaseQuantity(itemId) {
  const cart = getCart();
  const item = cart.items.find(i => i.id === itemId);
  if (item) {
    item.quantity = (item.quantity || 1) + 1;
    saveCart(cart);
    updateNavCartBadge();
    updateCartModalDisplay();
    console.log('[Cart] Quantity increased for item:', itemId, 'New quantity:', item.quantity);
  }
}

/**
 * Decrease quantity of an item in cart
 */
function decreaseQuantity(itemId) {
  const cart = getCart();
  const item = cart.items.find(i => i.id === itemId);
  if (item) {
    if ((item.quantity || 1) > 1) {
      item.quantity = (item.quantity || 1) - 1;
      saveCart(cart);
      updateNavCartBadge();
      updateCartModalDisplay();
      console.log('[Cart] Quantity decreased for item:', itemId, 'New quantity:', item.quantity);
    } else {
      removeFromCart(itemId);
    }
  }
}

/**
 * Get total quantity in cart
 */
function getCartCount() {
  const cart = getCart();
  return cart.items.reduce((total, item) => total + (item.quantity || 1), 0);
}

/**
 * Get total price of all cart items
 */
function getCartTotal() {
  const cart = getCart();
  return cart.items.reduce((total, item) => total + (item.price * (item.quantity || 1)), 0).toFixed(2);
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
  const cartBtns = document.querySelectorAll('#cartBtn');
  cartBtns.forEach(btn => {
    btn.textContent = `Cart (${count})`;
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
    const tagColor = item.serviceTag === 'LOCATION ONLY' ? 'rgba(100,200,255,0.1)' : item.serviceTag === 'EXTRA FEE' ? 'rgba(255,150,100,0.1)' : 'rgba(0,255,65,0.1)';
    const tagTextColor = item.serviceTag === 'LOCATION ONLY' ? '#64c8ff' : item.serviceTag === 'EXTRA FEE' ? '#ff9664' : '#00FF41';
    const quantity = item.quantity || 1;
    const itemTotal = (item.price * quantity).toFixed(2);

    html += `
      <div class="cart-item" style="display: flex; justify-content: space-between; align-items: flex-start; padding: 12px; border-bottom: 1px solid var(--border);">
        <div style="flex: 1;">
          <div style="font-weight: 600; color: var(--text);">${item.serviceName} <span style="color: var(--text-muted); font-size: 13px;">x${quantity}</span></div>
          <div style="font-size: 12px; padding: 4px 8px; background: ${tagColor}; color: ${tagTextColor}; border-radius: 4px; display: inline-block; margin-bottom: 6px; margin-top: 4px;">${item.serviceTag}</div>
          <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">$${item.price.toFixed(2)} each</div>
          <div style="display: flex; gap: 6px; align-items: center;">
            <button onclick="decreaseQuantity('${item.id}');"
                    style="background: var(--light-bg); border: 1px solid var(--border); color: var(--primary); cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 14px; font-weight: 600;">−</button>
            <span style="color: var(--text); font-weight: 600; min-width: 20px; text-align: center;">${quantity}</span>
            <button onclick="increaseQuantity('${item.id}');"
                    style="background: var(--light-bg); border: 1px solid var(--border); color: var(--primary); cursor: pointer; padding: 4px 8px; border-radius: 4px; font-size: 14px; font-weight: 600;">+</button>
            <span style="color: var(--text); font-weight: 600; margin-left: auto;">$${itemTotal}</span>
          </div>
        </div>
        <button onclick="removeFromCart('${item.id}');"
                style="background: transparent; border: none; color: var(--text-muted); cursor: pointer; padding: 0 8px; font-size: 18px; flex-shrink: 0;">
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

  // Setup proceed to checkout button in cart modal
  const proceedCheckoutBtn = document.getElementById('proceedCheckout');
  if (proceedCheckoutBtn) {
    proceedCheckoutBtn.addEventListener('click', (e) => {
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
