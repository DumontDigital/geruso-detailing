const Stripe = require('stripe');
require('dotenv').config();

console.log('[Stripe Config] Initializing Stripe...');
console.log('[Stripe Config] STRIPE_SECRET_KEY:', process.env.STRIPE_SECRET_KEY ? 'SET' : 'NOT SET');
console.log('[Stripe Config] STRIPE_WEBHOOK_SECRET:', process.env.STRIPE_WEBHOOK_SECRET ? 'SET' : 'NOT SET');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

const DEPOSIT_AMOUNT_CENTS = parseInt(process.env.DEPOSIT_AMOUNT_CENTS || '2500', 10); // $25.00 default

async function createCheckoutSession(bookingData) {
  try {
    console.log('[Stripe] Creating checkout session for booking:', bookingData.id);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${bookingData.service_type} - Deposit`,
              description: `${bookingData.booking_date} at ${bookingData.booking_time}`,
              metadata: {
                booking_id: bookingData.id,
                service_type: bookingData.service_type,
              },
            },
            unit_amount: DEPOSIT_AMOUNT_CENTS,
          },
          quantity: 1,
        },
      ],
      customer_email: bookingData.customer_email,
      metadata: {
        booking_id: bookingData.id,
        customer_name: bookingData.customer_name,
        service_type: bookingData.service_type,
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

function handleWebhook(rawBody, signature) {
  try {
    console.log('[Stripe Webhook] Verifying signature...');
    const event = stripe.webhooks.constructEvent(
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
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    return session;
  } catch (error) {
    console.error('[Stripe] Error retrieving session:', error.message);
    throw error;
  }
}

module.exports = {
  stripe,
  createCheckoutSession,
  handleWebhook,
  retrieveSession,
  DEPOSIT_AMOUNT_CENTS,
};
