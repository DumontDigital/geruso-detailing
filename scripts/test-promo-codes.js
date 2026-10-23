function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const module = { exports: {} };
eval(readFile('js/promo-codes.js'));

const promoCodes = module.exports;
assert(promoCodes.normalizePromoCode(' wmd ') === 'WMD', 'WMD was not normalized');
assert(promoCodes.getPromo('wMd').percentOff === 20, 'WMD is not configured for 20% off');

const totals = promoCodes.calculateTotals(95, 'WMD');
assert(totals.subtotal === 95, 'Subtotal changed unexpectedly');
assert(totals.discount === 19, 'WMD did not calculate a $19 discount on $95');
assert(totals.total === 76, 'WMD did not calculate a $76 total on $95');
assert(promoCodes.getPromo('NOT-A-CODE') === null, 'Unknown promo code was accepted');

print('PASS WMD is accepted case-insensitively for 20% off');
print('PASS promo totals use cent-based rounding');
print('PASS unknown promo codes are rejected');
