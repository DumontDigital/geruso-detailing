require('dotenv').config();

console.log('[Stripe Config] Stripe module loaded');

let stripe = null;
let stripeInitialized = false;

function initializeStripe() {
  if (stripeInitialized) return stripe;

  try {
    const Stripe = require('stripe');
    console.log('[Stripe Config] Initializing Stripe...');
    console.log('[Stripe Config] STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? 'SET' : 'NOT SET');
    console.log('[Stripe Config] STRIPE_WEBHOOK_SECRET:', process.env.STRIPE_WEBHOOK_SECRET ? 'SET' : 'NOT SET');

    stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
    stripeInitialized = true;
    return stripe;
  } catch (error) {
    console.error('[Stripe Config] Failed to initialize Stripe:', error.message);
    throw error;
  }
}

const DEPOSIT_AMOUNT_CENTS = parseInt(process.env.DEPOSIT_AMOUNT_CENTS || '2500', 10); // $25.00 default

// Pre-created Stripe price ID for the deposit (set via STRIPE_PRICE_DEPOSIT env var after running setup-stripe-products.js)
const STRIPE_PRICE_DEPOSIT = process.env.STRIPE_PRICE_DEPOSIT || null;

// Pre-created Stripe payment link for the deposit (set via STRIPE_PAYMENT_LINK_DEPOSIT env var)
const STRIPE_PAYMENT_LINK_DEPOSIT = process.env.STRIPE_PAYMENT_LINK_DEPOSIT || null;

async function createCheckoutSession(bookingData) {
  try {
    console.log('[Stripe] Creating checkout session for booking:', bookingData.id);

    const stripeClient = initializeStripe();

    // Build the line item — use pre-created price ID if available, otherwise inline price_data
    let lineItem;
    if (STRIPE_PRICE_DEPOSIT) {
      console.log('[Stripe] Using pre-created deposit price:', STRIPE_PRICE_DEPOSIT);
      lineItem = {
        price: STRIPE_PRICE_DEPOSIT,
        quantity: 1,
      };
    } else {
      console.log('[Stripe] No pre-created price found, using inline price_data');
      lineItem = {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `${bookingData.service_type} — Booking Deposit`,
            description: `${bookingData.booking_date} at ${bookingData.booking_time}`,
            metadata: {
              booking_id: bookingData.id,
              service_type: bookingData.service_type,
            },
          },
          unit_amount: DEPOSIT_AMOUNT_CENTS,
        },
        quantity: 1,
      };
    }

    const session = await stripeClient.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [lineItem],
      customer_email: bookingData.customer_email,
      client_reference_id: bookingData.id, // Links payment to booking in webhooks
      metadata: {
        booking_id: bookingData.id,
        customer_name: bookingData.customer_name,
        service_type: bookingData.service_type,
        booking_date: bookingData.booking_date,
        booking_time: bookingData.booking_time,
      },
      success_url: `${process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000'}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000'}/cancel?booking_id=${bookingData.id}`,
    });

    console.log('[Stripe] Checkout session created:', session.id);
    return session;
  } catch (error) {
    console.error('[Stripe] Error creating checkout session:', error.message);
    throw error;
  }
}

// Build a Payment Link URL with booking ID pre-attached (works if STRIPE_PAYMENT_LINK_DEPOSIT is set)
function getDepositPaymentLinkUrl(bookingId, customerEmail) {
  if (!STRIPE_PAYMENT_LINK_DEPOSIT) return null;
  const url = new URL(STRIPE_PAYMENT_LINK_DEPOSIT);
  url.searchParams.set('client_reference_id', bookingId);
  if (customerEmail) url.searchParams.set('prefilled_email', customerEmail);
  return url.toString();
}

function handleWebhook(rawBody, signature) {
  try {
    console.log('[Stripe Webhook] Verifying signature...');
    const stripeClient = initializeStripe();
    const event = stripeClient.webhooks.constructEvent(
      rawBody,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    console.log('[Stripe Webhook] Event type:', event.type);

    switch (event.type) {
      case 'checkout.session.completed':
        console.log('[Stripe Webhook] Payment succeeded');
        return { type: 'payment_succeeded', data: event.data.object };

      case 'charge.refunded':
        console.log('[Stripe Webhook] Payment refunded');
        return { type: 'payment_refunded', data: event.data.object };

      case 'charge.failed':
        console.log('[Stripe Webhook] Payment failed');
        return { type: 'payment_failed', data: event.data.object };

      default:
        console.log('[Stripe Webhook] Unhandled event type:', event.type);
        return { type: 'unknown', data: null };
    }
  } catch (error) {
    console.error('[Stripe Webhook] Error:', error.message);
    throw error;
  }
}

async function retrieveSession(sessionId) {
  try {
    console.log('[Stripe] Retrieving session:', sessionId);
    const stripeClient = initializeStripe();
    const session = await stripeClient.checkout.sessions.retrieve(sessionId);
    return session;
  } catch (error) {
    console.error('[Stripe] Error retrieving session:', error.message);
    throw error;
  }
}

module.exports = {
  createCheckoutSession,
  getDepositPaymentLinkUrl,
  handleWebhook,
  retrieveSession,
  initializeStripe,
  DEPOSIT_AMOUNT_CENTS,
  STRIPE_PRICE_DEPOSIT,
  STRIPE_PAYMENT_LINK_DEPOSIT,
};
