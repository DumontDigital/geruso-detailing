const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const { initializeStripe } = require('../stripe');
const { sendBookingConfirmation, sendOwnerNotification } = require('../email');
const promoCodes = require('../js/promo-codes');

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
const ADD_ON_SERVICE_NAMES = new Set([
  'Engine Bay Cleaning',
  'Pet Hair / Odor Elimination',
  'Headlight Restoration',
]);
const LONG_SERVICE_NAMES = new Set(['Ceramic Coating', 'Full Vehicle Polish']);

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
      const tag = ADD_ON_SERVICE_NAMES.has(name)
        ? 'EXTRA FEE'
        : (['MOBILE', 'LOCATION ONLY'].includes(requestedTag) ? requestedTag : catalogItem.tag);
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

function calculateCartSubtotal(cartItems) {
  return cartItems.reduce((total, item) => total + (item.price * item.quantity), 0);
}

function getUniqueServiceNames(cartItems, includeAddOns) {
  return [...new Set(cartItems
    .filter(item => ADD_ON_SERVICE_NAMES.has(item.name) === includeAddOns)
    .map(item => item.name))];
}

function getLongServiceNames(serviceNames) {
  return serviceNames.filter(name => LONG_SERVICE_NAMES.has(name));
}

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function removeGeneratedBookingNotes(notes) {
  return String(notes || '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line
      && !/^(Combined packages|Add-ons requested|Checkout selection):/i.test(line)
      && !/^Venue discount code /i.test(line))
    .join('\n');
}

function normalizeServiceAddress(value) {
  const parts = String(value || '')
    .split(',')
    .map(part => part.trim())
    .filter(Boolean);

  return parts
    .filter((part, index) => index === 0 || part.toLowerCase() !== parts[index - 1].toLowerCase())
    .join(', ');
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

async function sendCustomerBookingEmail(booking) {
  const result = await sendBookingConfirmation(buildBookingEmailData(booking, false));
  if (!result.success) {
    console.error('[Cart Email] Failed to send customer booking confirmation email:', result.error);
  } else {
    console.log('[Cart Email] Customer booking confirmation email sent successfully:', result.emailId || 'unknown');
  }
  return result;
}

router.post('/pay-later', async (req, res) => {
  try {
    const { items, customer = {}, promoCode = '' } = req.body;
    const cartItems = normalizeCartItems(items);
    const normalizedPromoCode = promoCodes.normalizePromoCode(promoCode);
    const promo = normalizedPromoCode ? promoCodes.getPromo(normalizedPromoCode) : null;

    if (cartItems.length === 0) {
      return res.status(400).json({ error: 'Your cart is empty or contains unavailable services.' });
    }

    const validationError = validateCartItems(cartItems);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    if (normalizedPromoCode && !promo) {
      return res.status(400).json({ error: 'That discount code is not valid. Please check it and try again.' });
    }

    const totals = promoCodes.calculateTotals(calculateCartSubtotal(cartItems), normalizedPromoCode);

    const bookingId = String(customer.bookingId || '').trim();
    if (!bookingId) {
      return res.status(400).json({ error: 'A scheduled booking is required before choosing pay after service.' });
    }

    const selectedMainServiceNames = getUniqueServiceNames(cartItems, false);
    const selectedAddOnNames = getUniqueServiceNames(cartItems, true);
    if (selectedMainServiceNames.length === 0) {
      return res.status(400).json({ error: 'Keep at least one main detailing service in your appointment.' });
    }

    const existingBookingResult = await pool.query(
      `SELECT * FROM bookings WHERE id = $1 AND status <> 'cancelled'`,
      [bookingId]
    );
    if (existingBookingResult.rowCount === 0) {
      return res.status(404).json({ error: 'This booking could not be found. Please schedule again.' });
    }

    const existingBooking = existingBookingResult.rows[0];
    const originallyScheduledLongServices = getLongServiceNames(
      String(existingBooking.service_type || '').split(' + ').map(name => name.trim())
    );
    const newlyAddedLongService = getLongServiceNames(selectedMainServiceNames)
      .find(name => !originallyScheduledLongServices.includes(name));
    if (newlyAddedLongService) {
      return res.status(400).json({
        error: `${newlyAddedLongService} needs a six-hour appointment window. Please add it on the Schedule page so the correct time can be reserved.`,
      });
    }

    const bookingServiceType = selectedMainServiceNames.join(' + ');
    const selectionParts = [`Main services: ${selectedMainServiceNames.join(', ')}`];
    if (selectedAddOnNames.length > 0) selectionParts.push(`Add-ons: ${selectedAddOnNames.join(', ')}`);
    const checkoutSelectionNote = `Checkout selection: ${selectionParts.join(' | ')}`;
    const preservedNotes = removeGeneratedBookingNotes(existingBooking.notes);
    const updatedNotes = [preservedNotes, checkoutSelectionNote].filter(Boolean).join('\n');
    const normalizedServiceAddress = normalizeServiceAddress(existingBooking.service_address);

    const bookingResult = await pool.query(
      `UPDATE bookings
       SET payment_status = $1,
           status = $2,
           service_type = $3,
           notes = $4,
           service_address = $5,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $6 AND status <> 'cancelled'
       RETURNING *`,
      ['pay_later', 'confirmed', bookingServiceType, updatedNotes, normalizedServiceAddress, bookingId]
    );

    if (bookingResult.rowCount === 0) {
      return res.status(404).json({ error: 'This booking could not be found. Please schedule again.' });
    }

    let booking = {
      ...bookingResult.rows[0],
      previous_payment_status: existingBooking.payment_status,
    };
    if (promo) {
      const promoMarker = `Venue discount code ${promo.code}`;
      const promoNote = `${promoMarker} — ${promo.percentOff}% off. Subtotal: ${money(totals.subtotal)}. Discount: -${money(totals.discount)}. Total after discount: ${money(totals.total)}.`;
      const notesWithPromo = [removeGeneratedBookingNotes(booking.notes), checkoutSelectionNote, promoNote]
        .filter(Boolean)
        .join('\n');
      const promoBookingResult = await pool.query(
        `UPDATE bookings
         SET notes = $1,
         updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND status <> 'cancelled'
         RETURNING *`,
        [notesWithPromo, bookingId]
      );
      if (promoBookingResult.rows.length > 0) {
        booking = {
          ...promoBookingResult.rows[0],
          previous_payment_status: booking.previous_payment_status,
        };
      }
    }

    if (String(booking.previous_payment_status || '').toLowerCase() !== 'pay_later') {
      await sendOwnerBookingEmail(booking, false);
    }
    const customerEmailResult = await sendCustomerBookingEmail(booking);

    const orderId = uuidv4();
    res.json({
      success: true,
      paymentStatus: 'pay_later',
      bookingId,
      orderId,
      promoCode: promo ? promo.code : null,
      discountPercent: promo ? promo.percentOff : 0,
      subtotal: totals.subtotal,
      discount: totals.discount,
      total: totals.total,
      customerEmailSent: !!customerEmailResult.success,
      customerEmailError: customerEmailResult.success ? null : customerEmailResult.error,
      successUrl: `/success?pay_later=true&booking_id=${encodeURIComponent(bookingId)}&order_id=${encodeURIComponent(orderId)}`,
    });
  } catch (error) {
    console.error('[Cart Pay Later] Error:', error.message);
    res.status(500).json({ error: 'Unable to confirm pay after service. Please try again.' });
  }
});

router.post('/checkout', async (req, res) => {
  res.status(410).json({
    error: 'Online payment is no longer offered for service bookings. Please choose Pay After Service.',
  });
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
