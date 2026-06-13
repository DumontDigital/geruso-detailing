const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const { initializeStripe } = require('../stripe');
const { verifyToken, requireRole } = require('../middleware/auth');
const { sendMaintenanceSubscriptionNotification } = require('../email');

const router = express.Router();

const PLANS = {
  biweekly: {
    key: 'biweekly',
    name: 'Biweekly Maintenance',
    intervalLabel: 'Every 2 weeks',
    priceCents: 10000,
    stripeRecurring: { interval: 'week', interval_count: 2 },
  },
  monthly: {
    key: 'monthly',
    name: 'Monthly Maintenance',
    intervalLabel: 'Monthly',
    priceCents: 15000,
    stripeRecurring: { interval: 'month', interval_count: 1 },
  },
};

function normalizeCustomer(customer = {}) {
  return {
    name: String(customer.name || '').trim(),
    email: String(customer.email || '').trim().toLowerCase(),
    phone: String(customer.phone || '').trim(),
  };
}

async function activateSubscriptionFromSession(session) {
  const subscriptionId = typeof session.subscription === 'string'
    ? session.subscription
    : session.subscription?.id;
  const customerId = typeof session.customer === 'string'
    ? session.customer
    : session.customer?.id;

  const result = await pool.query(
    `WITH existing AS (
       SELECT status FROM maintenance_subscriptions WHERE stripe_session_id = $1
     )
     UPDATE maintenance_subscriptions
     SET status = $2,
         stripe_subscription_id = COALESCE($3, stripe_subscription_id),
         stripe_customer_id = COALESCE($4, stripe_customer_id),
         updated_at = CURRENT_TIMESTAMP
     FROM existing
     WHERE maintenance_subscriptions.stripe_session_id = $1
     RETURNING maintenance_subscriptions.*, existing.status AS previous_status`,
    [session.id, 'active', subscriptionId || null, customerId || null]
  );

  if (result.rows.length > 0) {
    const subscription = result.rows[0];
    if (String(subscription.previous_status || '').toLowerCase() !== 'active') {
      await sendMaintenanceSubscriptionNotification(subscription);
    }
    return subscription;
  }
  return null;
}

router.post('/checkout', async (req, res) => {
  try {
    const plan = PLANS[String(req.body.planKey || req.body.plan || '').trim().toLowerCase()];
    const customer = normalizeCustomer(req.body.customer || {
      name: req.body.customerName,
      email: req.body.customerEmail,
      phone: req.body.customerPhone,
    });

    if (!plan) {
      return res.status(400).json({ error: 'Please choose a maintenance plan.' });
    }
    if (!customer.name || !customer.email || !customer.phone) {
      return res.status(400).json({ error: 'Name, email, and phone are required.' });
    }
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({ error: 'Stripe is not connected yet.' });
    }

    const id = uuidv4();
    const stripeClient = initializeStripe();
    const baseUrl = process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get('host')}`;

    await pool.query(
      `INSERT INTO maintenance_subscriptions (
        id, customer_name, customer_email, customer_phone, plan_key, plan_name,
        plan_interval, price_cents, status
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
      [
        id,
        customer.name,
        customer.email,
        customer.phone,
        plan.key,
        plan.name,
        plan.intervalLabel,
        plan.priceCents,
      ]
    );

    const session = await stripeClient.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      customer_email: customer.email,
      client_reference_id: id,
      line_items: [
        {
          price_data: {
            currency: 'usd',
            recurring: plan.stripeRecurring,
            product_data: {
              name: `Geruso Detailing - ${plan.name}`,
              description: 'Interior vacuum, dash wipe down, and exterior maintenance clean.',
              metadata: {
                plan_key: plan.key,
              },
            },
            unit_amount: plan.priceCents,
          },
          quantity: 1,
        },
      ],
      metadata: {
        source: 'maintenance_subscription',
        subscription_id: id,
        plan_key: plan.key,
        customer_name: customer.name,
        customer_phone: customer.phone,
      },
      success_url: `${baseUrl}/success?maintenance=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/memberships.html?cancelled=true`,
    });

    await pool.query(
      `UPDATE maintenance_subscriptions
       SET stripe_session_id = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [session.id, id]
    );

    res.json({ success: true, checkoutUrl: session.url, subscriptionId: id });
  } catch (error) {
    console.error('[Maintenance Checkout] Error:', error.message);
    res.status(500).json({ error: error && error.type ? error.message : 'Unable to start maintenance checkout.' });
  }
});

router.get('/session/:sessionId', async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(503).json({ error: 'Stripe is not configured.' });
    }

    const stripeClient = initializeStripe();
    const session = await stripeClient.checkout.sessions.retrieve(req.params.sessionId);
    let subscription = null;

    if (session.payment_status === 'paid' && session.mode === 'subscription') {
      subscription = await activateSubscriptionFromSession(session);
    }

    res.json({
      success: true,
      active: session.payment_status === 'paid' && session.mode === 'subscription',
      source: session.metadata?.source,
      paymentStatus: session.payment_status,
      subscriptionId: subscription?.id || session.client_reference_id,
      planName: subscription?.plan_name || '',
      planInterval: subscription?.plan_interval || '',
      customerName: subscription?.customer_name || session.metadata?.customer_name || '',
      customerEmail: subscription?.customer_email || session.customer_details?.email || '',
    });
  } catch (error) {
    console.error('[Maintenance Session] Error:', error.message);
    res.status(500).json({ error: 'Unable to verify maintenance checkout.' });
  }
});

router.get('/admin/subscriptions', verifyToken, requireRole(['owner', 'dev']), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT *
       FROM maintenance_subscriptions
       WHERE status <> 'pending'
       ORDER BY created_at DESC`
    );
    res.json({ subscriptions: result.rows });
  } catch (error) {
    console.error('[Maintenance Admin] Fetch error:', error.message);
    res.status(500).json({ error: 'Failed to fetch maintenance subscriptions.' });
  }
});

router.post('/admin/subscriptions/:id/status', verifyToken, requireRole(['owner', 'dev']), async (req, res) => {
  try {
    const status = String(req.body.status || '').toLowerCase();
    if (!['active', 'paused', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid subscription status.' });
    }

    const result = await pool.query(
      `UPDATE maintenance_subscriptions
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [status, req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Subscription not found.' });
    }

    const subscription = result.rows[0];
    if (subscription.stripe_subscription_id && process.env.STRIPE_SECRET_KEY) {
      try {
        const stripeClient = initializeStripe();
        if (status === 'paused') {
          await stripeClient.subscriptions.update(subscription.stripe_subscription_id, {
            pause_collection: { behavior: 'void' },
          });
        } else if (status === 'active') {
          await stripeClient.subscriptions.update(subscription.stripe_subscription_id, {
            pause_collection: null,
          });
        } else if (status === 'cancelled') {
          await stripeClient.subscriptions.cancel(subscription.stripe_subscription_id);
        }
      } catch (stripeError) {
        console.error('[Maintenance Admin] Stripe status warning:', stripeError.message);
      }
    }

    res.json({ success: true, subscription });
  } catch (error) {
    console.error('[Maintenance Admin] Status error:', error.message);
    res.status(500).json({ error: 'Failed to update subscription.' });
  }
});

router.delete('/admin/subscriptions/:id', verifyToken, requireRole(['owner', 'dev']), async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE maintenance_subscriptions
       SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Subscription not found.' });
    }

    const subscription = result.rows[0];
    if (subscription.stripe_subscription_id && process.env.STRIPE_SECRET_KEY) {
      try {
        const stripeClient = initializeStripe();
        await stripeClient.subscriptions.cancel(subscription.stripe_subscription_id);
      } catch (stripeError) {
        console.error('[Maintenance Admin] Stripe cancel warning:', stripeError.message);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('[Maintenance Admin] Delete error:', error.message);
    res.status(500).json({ error: 'Failed to cancel subscription.' });
  }
});

module.exports = { router, activateSubscriptionFromSession };
