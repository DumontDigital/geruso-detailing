(function attachPromoCodes(root, factory) {
  const api = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }

  if (root) {
    root.GerusoPromoCodes = api;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPromoCodes() {
  const PROMO_CODES = Object.freeze({
    WMD: Object.freeze({
      code: 'WMD',
      venue: 'WMD',
      percentOff: 20,
    }),
  });

  function normalizePromoCode(value) {
    return String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  }

  function getPromo(value) {
    return PROMO_CODES[normalizePromoCode(value)] || null;
  }

  function calculateTotals(subtotal, value) {
    const subtotalCents = Math.max(0, Math.round((Number(subtotal) || 0) * 100));
    const promo = getPromo(value);
    const discountCents = promo
      ? Math.round(subtotalCents * promo.percentOff / 100)
      : 0;

    return {
      promo,
      subtotal: subtotalCents / 100,
      discount: discountCents / 100,
      total: (subtotalCents - discountCents) / 100,
    };
  }

  return {
    PROMO_CODES,
    normalizePromoCode,
    getPromo,
    calculateTotals,
  };
});
