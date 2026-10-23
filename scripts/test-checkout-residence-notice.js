function assert(condition, message) {
  if (!condition) throw new Error(message);
}

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(name) { this.values.add(name); }
  remove(name) { this.values.delete(name); }
  contains(name) { return this.values.has(name); }
  toggle(name, force) {
    if (force) this.add(name); else this.remove(name);
  }
}

class FakeElement {
  constructor() {
    this.value = '';
    this.textContent = '';
    this.innerHTML = '';
    this.disabled = false;
    this.hidden = false;
    this.className = '';
    this.dataset = {};
    this.classList = new FakeClassList();
    this.listeners = {};
  }

  addEventListener(type, listener) { this.listeners[type] = listener; }
  setAttribute(name, value) { this[name] = value; }
}

function runCheckout(details) {
  const ids = [
    'summaryItems', 'summarySubtotal', 'summaryDiscountRow', 'summaryDiscountLabel',
    'summaryDiscount', 'summaryTotal', 'promoCode', 'applyPromoCode', 'promoMessage',
    'checkoutSubmitBtn', 'checkoutMessage',
    'customerName', 'customerEmail', 'customerPhone', 'serviceAddress',
    'serviceAddressNote', 'residenceAppointmentNotice', 'checkoutForm'
  ];
  const elements = {};
  ids.forEach(id => { elements[id] = new FakeElement(); });

  const document = {
    getElementById(id) { return elements[id]; },
    querySelectorAll() { return []; }
  };
  const storage = {
    gerusoCart: JSON.stringify({
      items: [{ serviceName: 'Car Wash', price: 95, serviceTag: 'LOCATION ONLY', quantity: 1 }]
    }),
    gerusoCheckoutDetails: JSON.stringify(details)
  };
  const localStorage = {
    getItem(key) { return storage[key] || null; },
    setItem(key, value) { storage[key] = String(value); }
  };
  const sessionStorage = {
    getItem() { return null; },
    removeItem() {}
  };
  const window = { location: { href: '' } };

  const html = readFile('checkout.html');
  const match = html.match(/<script>([\s\S]*?)<\/script>/i);
  assert(match, 'Could not find checkout inline script');
  eval(readFile('js/promo-codes.js'));
  eval(match[1]);
  return elements;
}

const residence = runCheckout({
  name: 'Customer',
  serviceLocation: 'Geruso Location',
  serviceAddress: '313 Lynne Lane, Mapleville, Rhode Island 02938'
});
assert(
  residence.residenceAppointmentNotice.classList.contains('show'),
  'Residence notice was not shown for a Geruso Location booking'
);
assert(
  residence.serviceAddressNote.textContent.includes('No walk-ins'),
  'Residence address note did not preserve the no-walk-ins policy'
);

const mobile = runCheckout({
  name: 'Customer',
  serviceLocation: 'Mobile',
  serviceAddress: '100 Main Street, Providence, RI 02903'
});
assert(
  !mobile.residenceAppointmentNotice.classList.contains('show'),
  'Residence notice appeared for a mobile booking'
);

mobile.promoCode.value = 'wmd';
mobile.applyPromoCode.listeners.click();
assert(mobile.promoMessage.textContent === 'WMD applied — 20% off.', 'Checkout did not confirm WMD');
assert(mobile.summarySubtotal.textContent === '$95.00', 'Checkout subtotal is incorrect');
assert(mobile.summaryDiscount.textContent === '-$19.00', 'Checkout discount is incorrect');
assert(mobile.summaryTotal.textContent === '$76.00', 'Checkout discounted total is incorrect');
assert(!mobile.summaryDiscountRow.hidden, 'Checkout discount row stayed hidden');

print('PASS residence checkout shows the drop-off and ride notice');
print('PASS mobile checkout keeps the residence notice hidden');
print('PASS checkout applies WMD and displays the discounted total');
