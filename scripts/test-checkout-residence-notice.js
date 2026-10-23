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
  matches(selector) { return selector === '[data-checkout-service]' && this.dataset.checkoutService !== undefined; }
  scrollIntoView() {}
}

function runCheckout(details) {
  const ids = [
    'summaryItems', 'summarySubtotal', 'summaryDiscountRow', 'summaryDiscountLabel',
    'summaryDiscount', 'summaryTotal', 'promoCode', 'applyPromoCode', 'promoMessage',
    'toggleAdditionalServices', 'additionalServicesPanel', 'checkoutServiceOptions',
    'addServicesFeedback', 'continueToConfirmation',
    'checkoutSubmitBtn', 'checkoutMessage',
    'customerName', 'customerEmail', 'customerPhone', 'serviceAddress',
    'serviceAddressNote', 'residenceAppointmentNotice', 'checkoutForm'
  ];
  const elements = {};
  ids.forEach(id => { elements[id] = new FakeElement(); });
  elements.additionalServicesPanel.hidden = true;

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
  serviceAddress: '100 Main Street, Providence, RI 02903',
  vehicleType: 'SUV'
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

mobile.toggleAdditionalServices.listeners.click();
assert(!mobile.additionalServicesPanel.hidden, 'Add-another-service panel did not open');
assert(mobile.checkoutServiceOptions.innerHTML.includes('$155.00'), 'SUV pricing was not shown for Premium Wash');
const premiumWash = new FakeElement();
premiumWash.value = 'Premium Wash';
premiumWash.checked = true;
premiumWash.dataset.checkoutService = '';
mobile.checkoutServiceOptions.listeners.change({ target: premiumWash });
assert(mobile.summarySubtotal.textContent === '$250.00', 'Adding SUV-priced Premium Wash did not update the subtotal');
assert(mobile.summaryDiscount.textContent === '-$50.00', 'Promo discount did not recalculate after adding a service');
assert(mobile.summaryTotal.textContent === '$200.00', 'Adding Premium Wash did not update the discounted total');
assert(mobile.addServicesFeedback.textContent.includes('1 additional service'), 'Added-service confirmation was not shown');

print('PASS residence checkout shows the drop-off and ride notice');
print('PASS mobile checkout keeps the residence notice hidden');
print('PASS checkout applies WMD and displays the discounted total');
print('PASS checkout adds another service and recalculates promo totals');
