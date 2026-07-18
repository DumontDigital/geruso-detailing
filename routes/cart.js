const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const { initializeStripe } = require('../stripe');
const { sendOwnerNotification } = require('../email');

const router = express.Router();

const SERVICE_CATALOG = {
  'Full Motorcycle Service': { price: 70, tag: 'MOBILE' },
  'Interior Detailing': { price: 100, tag: 'MOBILE' },
  'Car Wash': { price: 95, suvPrice: 110, truckPrice: 110, tag: 'MOBILE' },
  'Premium Wash': { price: 130, suvPrice: 155, truckPrice: 180, tag: 'MOBILE' },
  'Ceramic Coating': { price: 600, suvPrice: 625, truckPrice: 650, tag: 'MOBILE' },
  'Premium Package': { price: 175, suvPrice: 200, truckPrice: 225, tag: 'MOBILE' },
  'Premium Plus': { price: 245, suvPrice: 270, truckPrice: 295, tag: 'MOBILE' },
  'Ultra Premium': { price: 335, suvPrice: 360, truckPrice: 385, tag: 'MOBILE' },
  'Engine Bay Cleaning': { price: 75, tag: 'EXTRA FEE' },
  'Full Vehicle Polish': { price: 350, suvPrice: 375, truckPrice: 400, tag: 'MOBILE' },
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
      const requestedPrice = Number(item.price || 0);
      const allowedPrices = [catalogItem.price, catalogItem.suvPrice, catalogItem.truckPrice].filter(Boolean);
      const price = allowedPrices.includes(requestedPrice) ? requestedPrice : catalogItem.price;
      const requestedTag = String(item.serviceTag || item.tag || '').trim().toUpperCase();
      const tag = ['MOBILE', 'LOCATION ONLY', 'EXTRA FEE'].includes(requestedTag)
        ? requestedTag
        : catalogItem.tag;
      return {
        name,
        quantity,
        price,
        tag,
      };
    })
    .filter(Boolean);
}

function validateCartItems(cartItems) {
  return '';
}

function buildBookingEmailData(booking, paymentConfirmed = false) {
  return {
    customerName: booking.customer_name,
    customerEmail: booking.customer_email,
    customerPhone: booking.customer_phone,
    bookingDate: booking.booking_date,
    bookingTime: booking.booking_time,
    serviceType: booking.service_type,
    serviceAddress: booking.service_address,
    vehicleType: booking.vehicle_type,
    notes: booking.notes,
    hasPhoto: !!booking.vehicle_photo,
    paymentConfirmed,
  };
}

async function sendOwnerBookingEmail(booking, paymentConfirmed = false) {
  const result = await sendOwnerNotification(buildBookingEmailData(booking, paymentConfirmed));
  if (!result.success) {
    console.error('[Cart Email] Failed to send owner booking email:', result.error);
  } else {
    console.log('[Cart Email] Owner booking email sent successfully');
  }
}

router.post('/pay-later', async (req, res) => {
  try {
    const { items, customer = {} } = req.body;
    const cartItems = normalizeCartItems(items);

    if (cartItems.length === 0) {
      return res.status(400).json({ error: 'Your cart is empty or contains unavailable services.' });
    }

    const validationError = validateCartItems(cartItems);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const bookingId = String(customer.bookingId || '').trim();
    if (!bookingId) {
      return res.status(400).json({ error: 'A scheduled booking is required before choosing pay after service.' });
    }

    const bookingResult = await pool.query(
      `WITH existing AS (
         SELECT payment_status FROM bookings WHERE id = $3 AND status <> 'cancelled'
       )
       UPDATE bookings
       SET payment_status = $1, status = $2, updated_at = CURRENT_TIMESTAMP
       FROM existing
       WHERE bookings.id = $3 AND bookings.status <> 'cancelled'
       RETURNING bookings.*, existing.payment_status AS previous_payment_status`,
      ['pay_later', 'confirmed', bookingId]
    );

    if (bookingResult.rowCount === 0) {
      return res.status(404).json({ error: 'This booking could not be found. Please schedule again.' });
    }

    const booking = bookingResult.rows[0];
    if (String(booking.previous_payment_status || '').toLowerCase() !== 'pay_later') {
      await sendOwnerBookingEmail(booking, false);
    }

    const orderId = uuidv4();
    res.json({
      success: true,
      paymentStatus: 'pay_later',
      bookingId,
      orderId,
      successUrl: `/success?pay_later=true&booking_id=${encodeURIComponent(bookingId)}&order_id=${encodeURIComponent(orderId)}`,
    });
  } catch (error) {
    console.error('[Cart Pay Later] Error:', error.message);
    res.status(500).json({ error: 'Unable to confirm pay after service. Please try again.' });
  }
});

router.post('/checkout', async (req, res) => {
  return res.status(410).json({
    error: 'Online payment is no longer offered for service bookings. Please choose Pay After Service.',
  });

  try {
    const { items, customer = {} } = req.body;
    const cartItems = normalizeCartItems(items);

    if (cartItems.length === 0) {
      return res.status(400).json({ error: 'Your cart is empty or contains unavailable services.' });
    }

    const validationError = validateCartItems(cartItems);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({
        error: 'Online payment is not connected yet. Please contact Geruso Detailing to complete checkout.',
      });
    }

    const customerEmail = String(customer.email || '').trim();
    const bookingId = String(customer.bookingId || '').trim();
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

    const metadata = {
      order_id: orderId,
      customer_name: String(customer.name || '').trim(),
      customer_phone: String(customer.phone || '').trim(),
      service_address: String(customer.serviceAddress || '').trim(),
      source: 'cart_checkout',
    };
    if (bookingId) metadata.booking_id = bookingId;

    const session = await stripeClient.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: lineItems,
      customer_email: customerEmail || undefined,
      client_reference_id: orderId,
      metadata,
      success_url: `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/checkout?cancelled=true`,
    });

    if (bookingId) {
      await pool.query(
        `UPDATE bookings
         SET stripe_session_id = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND status <> 'cancelled'`,
        [session.id, bookingId]
      );
    }

    res.json({
      success: true,
      checkoutUrl: session.url,
      orderId,
    });
  } catch (error) {
    console.error('[Cart Checkout] Error:', error.message);
    res.status(500).json({
      error: error && error.type ? error.message : 'Unable to start checkout. Please try again.',
    });
  }
});

router.get('/session/:sessionId', async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({ error: 'Stripe is not configured.' });
    }

    const stripeClient = initializeStripe();
    const session = await stripeClient.checkout.sessions.retrieve(req.params.sessionId);
    const bookingId = session.metadata && session.metadata.booking_id;

    if (session.payment_status === 'paid' && bookingId) {
      const bookingResult = await pool.query(
        `WITH existing AS (
           SELECT payment_status FROM bookings
           WHERE (stripe_session_id = $1 OR id = $2) AND status <> 'cancelled'
         )
         UPDATE bookings
         SET payment_status = $3,
             status = $4,
             stripe_payment_intent_id = $5,
             stripe_session_id = COALESCE(stripe_session_id, $1),
             updated_at = CURRENT_TIMESTAMP
         FROM existing
         WHERE (bookings.stripe_session_id = $1 OR bookings.id = $2) AND bookings.status <> 'cancelled'
         RETURNING bookings.*, existing.payment_status AS previous_payment_status`,
        [session.id, bookingId, 'paid', 'confirmed', session.payment_intent]
      );

      if (bookingResult.rows.length > 0) {
        const booking = bookingResult.rows[0];
        if (String(booking.previous_payment_status || '').toLowerCase() !== 'paid') {
          await sendOwnerBookingEmail(booking, true);
        }
      }
    }

    res.json({
      success: true,
      source: session.metadata && session.metadata.source,
      paymentStatus: session.payment_status,
      orderId: session.client_reference_id,
      amountTotal: session.amount_total,
      customerEmail: session.customer_details && session.customer_details.email,
      customerName: session.metadata && session.metadata.customer_name,
      customerPhone: session.metadata && session.metadata.customer_phone,
      serviceAddress: session.metadata && session.metadata.service_address,
      bookingId,
    });
  } catch (error) {
    console.error('[Cart Checkout] Session lookup error:', error.message);
    res.status(500).json({ error: 'Unable to verify checkout session.' });
  }
});

module.exports = router;
