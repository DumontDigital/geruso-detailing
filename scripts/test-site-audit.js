const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = path.resolve(__dirname, '..');
const activePages = [
  'home.html',
  'services.html',
  'work.html',
  'memberships.html',
  'schedule.html',
  'reviews.html',
  'contact.html',
  'checkout.html',
  'success.html',
  'cancel.html',
  'login.html',
];
const routePaths = new Set([
  '/', '/customer', '/login', '/app', '/dashboard', '/booking', '/booking.html',
  '/services', '/work', '/memberships', '/maintenance', '/maintenance.html',
  '/membership', '/membership.html', '/schedule', '/schedule.html', '/reviews',
  '/contact', '/checkout', '/success', '/cancel', '/admin-dashboard.html',
  '/owner-dashboard.html', '/dev-dashboard.html', '/staff-dashboard.html', '/index.html',
]);

function localTargetExists(rawTarget) {
  if (!rawTarget || rawTarget === '#' || rawTarget.startsWith('#')) return true;
  if (rawTarget.includes('${')) return true;
  if (/^(?:https?:|mailto:|tel:|javascript:|data:)/i.test(rawTarget)) return true;
  if (!rawTarget.startsWith('/')) return fs.existsSync(path.join(root, rawTarget.split(/[?#]/)[0]));

  const target = rawTarget.split(/[?#]/)[0] || '/';
  if (target.startsWith('/api/') || routePaths.has(target)) return true;
  return fs.existsSync(path.join(root, target.replace(/^\//, '')));
}

let linkCount = 0;
let buttonCount = 0;
for (const page of activePages) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  const attributes = [...html.matchAll(/\b(?:href|src)=["']([^"']+)["']/gi)];
  for (const [, target] of attributes) {
    linkCount += 1;
    assert(localTargetExists(target), `${page} points to missing local target: ${target}`);
  }

  const buttons = [...html.matchAll(/<button\b([^>]*)>/gi)];
  for (const [, attributesText] of buttons) {
    buttonCount += 1;
    const isWired = /type=["']submit["']/i.test(attributesText)
      || /\bonclick=/i.test(attributesText)
      || /\bid=/i.test(attributesText)
      || /\bdata-[\w-]+=/i.test(attributesText);
    assert(isWired, `${page} has a button with no submit action, id, click handler, or data action: <button${attributesText}>`);
  }
}

const shell = fs.readFileSync(path.join(root, 'js/customer-shell.js'), 'utf8');
for (const [, target] of shell.matchAll(/href=["']([^"']+)["']/gi)) {
  linkCount += 1;
  assert(localTargetExists(target), `Customer navigation points to missing local target: ${target}`);
}

const expectedMainServices = {
  'Car Wash': { priceText: '$95+', basePrice: 95 },
  'Premium Wash': { priceText: '$130+', basePrice: 130 },
  'Interior Detailing': { priceText: '$100', basePrice: 100 },
  'Premium Package': { priceText: '$175', basePrice: 175 },
  'Premium Plus': { priceText: '$245+', basePrice: 245 },
  'Ultra Premium': { priceText: '$335+', basePrice: 335 },
  'Full Motorcycle Service': { priceText: '$70', basePrice: 70 },
  'Ceramic Coating': { priceText: '$600+', basePrice: 600 },
  'Full Vehicle Polish': { priceText: '$350+', basePrice: 350 },
};
const expectedAddOns = {
  'Engine Bay Cleaning': 75,
  'Pet Hair / Odor Elimination': 50,
  'Headlight Restoration': 50,
};

const servicesHtml = fs.readFileSync(path.join(root, 'services.html'), 'utf8');
const scheduleHtml = fs.readFileSync(path.join(root, 'schedule.html'), 'utf8');
const checkoutHtml = fs.readFileSync(path.join(root, 'checkout.html'), 'utf8');
const cartRoute = fs.readFileSync(path.join(root, 'routes/cart.js'), 'utf8');
const cardSegments = servicesHtml.split('<div class="service-card" data-cat="').slice(1);
const cards = cardSegments.map(segment => ({
  category: (segment.match(/^([^"]+)/) || [])[1],
  name: (segment.match(/<h3>([^<]+)<\/h3>/) || [])[1],
  price: (segment.match(/<div class="price">([^<]+)<\/div>/) || [])[1],
  href: (segment.match(/<a href="([^"]+)" class="btn btn-primary">/) || [])[1],
}));

assert(cards.length === 13, `Expected 13 service cards, found ${cards.length}`);
assert(servicesHtml.includes('data-cat="all"') && servicesHtml.includes('data-cat="mobile"') && servicesHtml.includes('data-cat="addon"'), 'Service filter buttons are incomplete');
assert(servicesHtml.includes("tab.addEventListener('click'"), 'Service filter buttons are not wired');

for (const [name, details] of Object.entries(expectedMainServices)) {
  const card = cards.find(item => item.name === name);
  assert(card, `Missing service card: ${name}`);
  assert(card.category === 'mobile', `${name} is in the wrong service category`);
  assert(card.price === details.priceText, `${name} shows ${card.price}; expected ${details.priceText}`);
  assert(card.href === `/schedule.html?service=${encodeURIComponent(name)}`, `${name} booking button has the wrong target`);
  assert(scheduleHtml.includes(`'${name}'`), `${name} is missing from scheduling logic`);
  assert(checkoutHtml.includes(`'${name}': { price: ${details.basePrice}`), `${name} base price is missing or incorrect in checkout`);
  assert(cartRoute.includes(`'${name}': { price: ${details.basePrice}`), `${name} base price is missing or incorrect in backend validation`);
}

const maintenanceCard = cards.find(item => item.name === 'Maintenance Plans');
assert(maintenanceCard && maintenanceCard.href === '/memberships.html', 'Maintenance Plans button does not open memberships');

for (const [name, price] of Object.entries(expectedAddOns)) {
  const card = cards.find(item => item.name === name);
  assert(card, `Missing add-on card: ${name}`);
  assert(card.category === 'addon', `${name} is in the wrong service category`);
  assert(card.href === `/schedule.html?addOn=${encodeURIComponent(name)}`, `${name} add-on button has the wrong target`);
  assert(scheduleHtml.includes(`name="addOns" value="${name}" data-price="${price}"`), `${name} is missing or mispriced in scheduling`);
  assert(checkoutHtml.includes(`'${name}': { price: ${price}`), `${name} is missing or mispriced in checkout`);
  assert(cartRoute.includes(`'${name}': { price: ${price}`), `${name} is missing or mispriced in backend validation`);
}

for (const vehicleType of ['Car', 'Motorcycle', 'SUV', 'Truck']) {
  assert(scheduleHtml.includes(`<option value="${vehicleType}">${vehicleType}</option>`), `Vehicle type is missing: ${vehicleType}`);
}

assert(scheduleHtml.includes("params.get('service')"), 'Schedule does not read service booking links');
assert(scheduleHtml.includes("params.get('addOn')"), 'Schedule does not read add-on booking links');
assert(checkoutHtml.includes("GerusoPromoCodes.calculateTotals"), 'Checkout promo total calculation is not wired');
assert(checkoutHtml.includes('id="toggleAdditionalServices"'), 'Checkout add-another-service control is missing');
assert(checkoutHtml.includes("getElementById('checkoutServiceOptions').addEventListener('change'"), 'Checkout service checkboxes are not wired');
assert(!checkoutHtml.includes('>Keep Shopping<'), 'Checkout still sends customers backward with Keep Shopping');
assert(cartRoute.includes('promoCodes.calculateTotals'), 'Backend promo validation is not wired');
assert(cartRoute.includes('service_type = $3'), 'Backend does not save checkout service additions to the booking');

const contactHtml = fs.readFileSync(path.join(root, 'contact.html'), 'utf8');
const membershipsHtml = fs.readFileSync(path.join(root, 'memberships.html'), 'utf8');
const workHtml = fs.readFileSync(path.join(root, 'work.html'), 'utf8');
assert(contactHtml.includes("getElementById('contactForm').addEventListener('submit'"), 'Contact form submit button is not wired');
assert(contactHtml.includes('window.location.href = `mailto:'), 'Contact form does not create an email action');
assert(membershipsHtml.includes('function selectPlan(key, name)'), 'Membership plan buttons are not wired');
assert(membershipsHtml.includes("getElementById('membershipForm').addEventListener('submit'"), 'Membership checkout button is not wired');
assert(workHtml.includes("querySelectorAll('.gallery-item').forEach"), 'Work gallery buttons are not wired');
assert(shell.includes('function renderCartModal()'), 'Shared cart button/modal is not wired');

console.log(`PASS ${linkCount} customer links and assets resolve to files or registered routes`);
console.log(`PASS ${buttonCount} buttons have an action hook or submit behavior`);
console.log('PASS all 9 main services, 3 add-ons, maintenance, prices, and booking targets are consistent');
console.log('PASS vehicle types, filters, forms, gallery, cart, scheduling, checkout, and backend validation are wired');
