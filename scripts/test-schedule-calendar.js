/* Run with JavaScriptCore on macOS:
 * /System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc scripts/test-schedule-calendar.js
 */

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...names) { names.forEach(name => this.values.add(name)); }
  remove(...names) { names.forEach(name => this.values.delete(name)); }
  contains(name) { return this.values.has(name); }
  toggle(name, force) {
    const shouldAdd = force === undefined ? !this.contains(name) : !!force;
    if (shouldAdd) this.add(name); else this.remove(name);
    return shouldAdd;
  }
}

class FakeElement {
  constructor(tagName = 'div', ownerDocument = null) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.listeners = {};
    this.classList = new FakeClassList();
    this.style = {};
    this.value = '';
    this.checked = false;
    this.disabled = false;
    this.textContent = '';
    this.title = '';
    this.nextElementSibling = null;
    this.parentNode = null;
    this._innerHTML = '';
  }

  set className(value) {
    this.classList = new FakeClassList();
    String(value || '').split(/\s+/).filter(Boolean).forEach(name => this.classList.add(name));
  }

  get className() { return Array.from(this.classList.values).join(' '); }

  set innerHTML(value) {
    this._innerHTML = String(value || '');
    this.children = [];
    if (this.id === 'additionalServicesList' && this.ownerDocument) {
      this.ownerDocument.parsePackageInputs(this._innerHTML);
    }
  }

  get innerHTML() { return this._innerHTML; }

  addEventListener(type, listener) {
    if (!this.listeners[type]) this.listeners[type] = [];
    this.listeners[type].push(listener);
  }

  dispatch(type, target = this) {
    (this.listeners[type] || []).forEach(listener => listener({ target, preventDefault() {} }));
  }

  appendChild(child) {
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    }
  }

  querySelector(selector) {
    if (selector === '.package-role') {
      return this.children.find(child => child.classList.contains('package-role')) || null;
    }
    if (selector === 'strong') {
      return this.children.find(child => child.tagName === 'STRONG') || null;
    }
    return null;
  }

  insertAdjacentElement(position, element) {
    if (!this.parentNode || position !== 'afterend') return null;
    const index = this.parentNode.children.indexOf(this);
    element.parentNode = this.parentNode;
    this.parentNode.children.splice(index + 1, 0, element);
    return element;
  }

  matches(selector) {
    if (!this.ownerDocument) return false;
    if (selector.includes('additionalServices')) return this.name === 'additionalServices';
    if (selector.includes('addOns')) return this.name === 'addOns';
    return false;
  }

  setAttribute(name, value) { this[name] = value; }
  removeAttribute(name) { delete this[name]; }
}

class FakeDocument {
  constructor() {
    this.readyState = 'complete';
    this.elements = {};
    this.packageInputs = [];
    this.addOnInputs = [];
  }

  addElement(id, tagName = 'div') {
    const element = new FakeElement(tagName, this);
    element.id = id;
    this.elements[id] = element;
    return element;
  }

  getElementById(id) { return this.elements[id] || null; }
  createElement(tagName) { return new FakeElement(tagName, this); }
  addEventListener() {}

  parsePackageInputs(html) {
    this.packageInputs = [];
    const inputPattern = /<input type="checkbox" name="additionalServices" value="([^"]+)"([^>]*)>/g;
    let match;
    while ((match = inputPattern.exec(html))) {
      const input = new FakeElement('input', this);
      input.name = 'additionalServices';
      input.value = match[1];
      input.checked = /\bchecked\b/.test(match[2]);

      const text = new FakeElement('span', this);
      const strong = new FakeElement('strong', this);
      strong.textContent = input.value;
      text.appendChild(strong);
      if (html.slice(match.index, html.indexOf('</label>', match.index)).includes('package-role')) {
        const badge = new FakeElement('span', this);
        badge.className = 'package-role';
        badge.textContent = 'Main';
        text.appendChild(badge);
      }
      input.nextElementSibling = text;
      this.packageInputs.push(input);
    }
  }

  querySelector(selector) {
    const byName = {
      'select[name="vehicleType"]': this.elements.vehicleType,
      'input[name="customerName"]': this.elements.customerName,
      'input[name="customerEmail"]': this.elements.customerEmail,
      'input[name="customerPhone"]': this.elements.customerPhone,
      'textarea[name="notes"]': this.elements.notes
    };
    return byName[selector] || null;
  }

  querySelectorAll(selector) {
    if (selector.includes('additionalServices')) return this.packageInputs.slice();
    if (selector === 'input[name="addOns"]') return this.addOnInputs.slice();
    if (selector === 'input[name="addOns"]:checked') return this.addOnInputs.filter(input => input.checked);
    return [];
  }
}

var document = new FakeDocument();
[
  ['vehiclePhotoInput', 'input'], ['photoPreview', 'div'], ['photoPreviewImg', 'img'], ['photoFileName', 'div'],
  ['additionalServicesGroup', 'div'], ['additionalServicesList', 'div'], ['bookingForm', 'form'],
  ['summaryService', 'span'], ['summaryPrice', 'span'], ['summaryDate', 'span'], ['summaryTime', 'span'],
  ['bookingSummary', 'div'], ['addressFieldGroup', 'div'], ['locationNoteGroup', 'div'],
  ['serviceAddressInput', 'input'], ['serviceStateSelect', 'select'], ['serviceZipInput', 'input'],
  ['mobileAreaHelp', 'div'], ['locationNoteTitle', 'div'], ['locationNoteText', 'div'],
  ['serviceModeGroup', 'div'], ['mobileModeOption', 'div'], ['locationModeOption', 'div'],
  ['calendarMonth', 'h3'], ['calendarGrid', 'div'], ['timeMessage', 'div'], ['timeSlotsGrid', 'div'],
  ['prevMonth', 'button'], ['nextMonth', 'button'], ['messageBox', 'div'], ['submitBtn', 'button'],
  ['customerName', 'input'], ['customerEmail', 'input'], ['customerPhone', 'input'], ['vehicleType', 'select'],
  ['notes', 'textarea']
].forEach(item => document.addElement(item[0], item[1]));

['Engine Bay Cleaning', 'Pet Hair / Odor Elimination', 'Headlight Restoration'].forEach(name => {
  const input = new FakeElement('input', document);
  input.name = 'addOns';
  input.value = name;
  input.dataset = { price: '50' };
  document.addOnInputs.push(input);
});

var window = this;
window.window = window;
window.document = document;
window.location = { search: '', href: '' };
window.addEventListener = function() {};
window.setInterval = function() { return 1; };
window.clearInterval = function() {};
var setInterval = window.setInterval;
var setTimeout = function(callback) { callback(); return 1; };
var console = { log() {}, warn() {}, error() {} };
var localStorage = {
  values: {},
  getItem(key) { return this.values[key] || null; },
  setItem(key, value) { this.values[key] = String(value); }
};
var fetch = function() { return new Promise(function() {}); };
var URLSearchParams = class {
  constructor() {}
  get() { return null; }
};

const html = readFile('schedule.html');
const match = html.match(/<script>([\s\S]*?)<\/script>/i);
assert(match, 'Could not find the schedule inline script');
eval(match[1]);

const form = document.getElementById('bookingForm');
const carWash = document.packageInputs.find(input => input.value === 'Car Wash');
assert(carWash, 'Car Wash package was not rendered');
carWash.checked = true;
form.dispatch('change', carWash);

assert(document.packageInputs.includes(carWash), 'Service click replaced the active checkbox DOM');
assert(document.getElementById('summaryService').textContent === 'Car Wash', 'Service summary did not update immediately');

const availableDays = document.getElementById('calendarGrid').children.filter(day => day.classList.contains('available'));
assert(availableDays.length > 0, 'Service click did not activate calendar days');

availableDays[0].dispatch('click');
assert(document.getElementById('timeSlotsGrid').children.length > 0, 'Date click waited for the unresolved backend request');
assert(document.getElementById('timeMessage').style.display === 'none', 'Available-times message did not update immediately');

const ceramic = document.packageInputs.find(input => input.value === 'Ceramic Coating');
ceramic.checked = true;
form.dispatch('change', ceramic);
assert(document.getElementById('timeSlotsGrid').children.length === 2, 'Long-service times did not refresh immediately');

carWash.checked = false;
form.dispatch('change', carWash);
assert(document.getElementById('summaryService').textContent === 'Ceramic Coating', 'Unchecking the main package did not promote the next package');
const ceramicDays = document.getElementById('calendarGrid').children.filter(day => day.classList.contains('available'));
assert(ceramicDays.length > 0, 'Promoting the next package disabled the current month');

print('PASS service click activates the current month immediately');
print('PASS date click renders time slots without waiting for the backend');
print('PASS combined and promoted packages refresh calendar state immediately');
