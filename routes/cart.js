const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { initializeStripe } = require('../stripe');

const router = express.Router();

const SERVICE_CATALOG = {
  'Full Motorcycle Service': { price: 70, tag: 'MOBILE' },
  'Interior Detailing': { price: 100, tag: 'MOBILE' },
  'Car Wash': { price: 85, tag: 'MOBILE' },
  'Ceramic Coating': { price: 400, tag: 'LOCATION ONLY' },
  'Premium Package': { price: 170, tag: 'MOBILE' },
  'Ultra Premium': { price: 335, tag: 'MOBILE' },
  'Engine Bay Cleaning': { price: 75, tag: 'MOBILE' },
  'Full Vehicle Polish': { price: 250, tag: 'LOCATION ONLY' },
  'Pet Hair / Odor Elimination': { price: 50, tag: 'EXTRA FEE' },
  'Headlight Restoration': { price: 50, tag: 'EXTRA FEE' },
};

function normalizeCartItems(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map(item => {
      const name = String(item.serviceName || item.name || '').trim();
      const catalogItem = SERVICE_CATALOG[name];
      if (!catalogItem) return null;

      const quantity = Math.max(1, Math.min(parseInt(item.quantity || 1, 10) || 1, 10));
      return {
        name,
        quantity,
        price: catalogItem.price,
        tag: catalogItem.tag,
      };
    })
    .filter(Boolean);
}

router.post('/checkout', async (req, res) => {
  try {
    const { items, customer = {}, preferredPaymentMethod = 'card_wallet' } = req.body;
    const cartItems = normalizeCartItems(items);

    if (cartItems.length === 0) {
      return res.status(400).json({ error: 'Your cart is empty or contains unavailable services.' });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({
        error: 'Online payment is not connected yet. Please contact Geruso Detailing to complete checkout.',
      });
    }

    const customerEmail = String(customer.email || '').trim();
    const orderId = uuidv4();
    const stripeClient = initializeStripe();
    const baseUrl = process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get('host')}`;

    const lineItems = cartItems.map(item => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.name,
          description: item.tag,
          metadata: {
            service_tag: item.tag,
          },
        },
        unit_amount: Math.round(item.price * 100),
      },
      quantity: item.quantity,
    }));

    const session = await stripeClient.checkout.sessions.create({
      mode: 'payment',
      automatic_payment_methods: { enabled: true },
      line_items: lineItems,
      customer_email: customerEmail || undefined,
      client_reference_id: orderId,
      metadata: {
        order_id: orderId,
        customer_name: String(customer.name || '').trim(),
        customer_phone: String(customer.phone || '').trim(),
        preferred_payment_method: String(preferredPaymentMethod || 'card_wallet'),
        source: 'cart_checkout',
      },
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/checkout?cancelled=true`,
    });

    res.json({
      success: true,
      checkoutUrl: session.url,
      orderId,
    });
  } catch (error) {
    console.error('[Cart Checkout] Error:', error.message);
    res.status(500).json({ error: 'Unable to start checkout. Please try again.' });
  }
});

router.get('/session/:sessionId', async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({ error: 'Stripe is not configured.' });
    }

    const stripeClient = initializeStripe();
    const session = await stripeClient.checkout.sessions.retrieve(req.params.sessionId);

    res.json({
      success: true,
      source: session.metadata && session.metadata.source,
      paymentStatus: session.payment_status,
      orderId: session.client_reference_id,
      amountTotal: session.amount_total,
      customerEmail: session.customer_details && session.customer_details.email,
    });
  } catch (error) {
    console.error('[Cart Checkout] Session lookup error:', error.message);
    res.status(500).json({ error: 'Unable to verify checkout session.' });
  }
});

module.exports = router;
