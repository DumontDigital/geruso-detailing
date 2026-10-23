function assert(condition, message) {
  if (!condition) throw new Error(message);
}

class FakeClassList {
  constructor(active) { this.values = new Set(active ? ['active'] : []); }
  add(name) { this.values.add(name); }
  remove(name) { this.values.delete(name); }
  contains(name) { return this.values.has(name); }
}

function makeTab(category, active) {
  return {
    dataset: { cat: category },
    classList: new FakeClassList(active),
    listeners: {},
    addEventListener(type, listener) { this.listeners[type] = listener; },
  };
}

function makeCard(category) {
  return { dataset: { cat: category }, style: { display: 'flex' } };
}

const tabs = [makeTab('all', true), makeTab('mobile'), makeTab('addon')];
const cards = [makeCard('mobile'), makeCard('mobile'), makeCard('addon')];
const document = {
  querySelectorAll(selector) {
    if (selector === '.category-tab') return tabs;
    if (selector === '.service-card') return cards;
    return [];
  }
};

const html = readFile('services.html');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
assert(scripts.length > 0, 'Services filter script is missing');
eval(scripts[scripts.length - 1][1]);

tabs[2].listeners.click();
assert(tabs[2].classList.contains('active'), 'Add-ons filter did not become active');
assert(!tabs[0].classList.contains('active'), 'All-services filter stayed active');
assert(cards[0].style.display === 'none' && cards[1].style.display === 'none', 'Main services stayed visible under Add-Ons');
assert(cards[2].style.display === 'flex', 'Add-ons were hidden by the Add-Ons filter');

tabs[0].listeners.click();
assert(cards.every(card => card.style.display === 'flex'), 'All Services did not restore every card');

print('PASS service category buttons filter and restore all service cards');
