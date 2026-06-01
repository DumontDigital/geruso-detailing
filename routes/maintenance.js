const express = require('express');
const { v4: uuidv4 } = require('uuid');
const pool = require('../db');
const { initializeStripe } = require('../stripe');
const { verifyToken, requireRole } = require('../middleware/auth');

const router = express.Router();

const MAINTENANCE_PLANS = {
  biweekly: {
    key: 'biweekly',
    name: 'Biweekly Maintenance',
    intervalLabel: 'Every 2 weeks',
    amountCents: 10000,
    recurring: { interval: 'week', interval_count: 2 }
  },
  monthly: {
    key: 'monthly',
    name: 'Monthly Maintenance',
    intervalLabel: 'Every month',
    amountCents: 13000,
    recurring: { interval: 'month' }
  }
};

function normalizeStripeId(value) {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

async function activateSubscriptionFromSession(session) {
  const email = session.customer_details?.email || session.customer_email || '';
  const result = await pool.query(
    `UPDATE maintenance_subscriptions
     SET status = 'active',
         stripe_subscription_id = COALESCE($2, stripe_subscription_id),
         stripe_customer_id = COALESCE($3, stripe_customer_id),
         customer_email = COALESCE(NULLIF($4, ''), customer_email),
         updated_at = CURRENT_TIMESTAMP
     WHERE stripe_session_id = $1
     RETURNING *`,
    [
      session.id,
      normalizeStripeId(session.subscription),
      normalizeStripeId(session.customer),
      email
    ]
  );
  return result.rows[0] || null;
}

router.post('/checkout', async (req, res) => {
  try {
    const { planKey, customerName, customerEmail, customerPhone } = req.body;
    const plan = MAINTENANCE_PLANS[planKey];

    if (!plan || !customerName?.trim() || !customerEmail?.trim() || !customerPhone?.trim()) {
      return res.status(400).json({ error: 'Choose a plan and enter your name, email, and phone number.' });
    }

    const id = uuidv4();
    await pool.query(
      `INSERT INTO maintenance_subscriptions
       (id, customer_name, customer_email, customer_phone, plan_key, plan_name, plan_interval, amount_cents, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')`,
      [
        id,
        customerName.trim(),
        customerEmail.trim().toLowerCase(),
        customerPhone.trim(),
        plan.key,
        plan.name,
        plan.intervalLabel,
        plan.amountCents
      ]
    );

    const stripe = initializeStripe();
    const origin = process.env.RENDER_EXTERNAL_URL || `${req.protocol}://${req.get('host')}`;
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: customerEmail.trim().toLowerCase(),
      client_reference_id: id,
      line_items: [{
        price_data: {
          currency: 'usd',
          recurring: plan.recurring,
          product_data: {
            name: plan.name,
            description: 'Interior vacuum, dash wipe-down, and exterior maintenance clean.'
          },
          unit_amount: plan.amountCents
        },
        quantity: 1
      }],
      metadata: {
        source: 'maintenance_subscription',
        maintenance_subscription_id: id,
        plan_key: plan.key,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim()
      },
      success_url: `${origin}/memberships.html?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/memberships.html?cancelled=1`
    });

    await pool.query(
      `UPDATE maintenance_subscriptions
       SET stripe_session_id = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [session.id, id]
    );

    return res.json({ checkoutUrl: session.url });
  } catch (error) {
    console.error('[Maintenance] Checkout error:', error.message);
    return res.status(500).json({ error: 'Unable to start membership checkout. Please try again.' });
  }
});

router.get('/session/:sessionId', async (req, res) => {
  try {
    const stripe = initializeStripe();
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    if (session.metadata?.source !== 'maintenance_subscription') {
      return res.status(404).json({ error: 'Membership checkout was not found.' });
    }
    if (session.status === 'complete') {
      await activateSubscriptionFromSession(session);
    }
    return res.json({ active: session.status === 'complete' });
  } catch (error) {
    console.error('[Maintenance] Session error:', error.message);
    return res.status(500).json({ error: 'Unable to verify membership checkout.' });
  }
});

router.get('/admin/subscriptions', verifyToken, requireRole(['owner', 'dev']), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT * FROM maintenance_subscriptions
       WHERE status <> 'pending'
       ORDER BY created_at DESC`
    );
    return res.json({ subscriptions: result.rows });
  } catch (error) {
    console.error('[Maintenance] Admin list error:', error.message);
    return res.status(500).json({ error: 'Unable to load memberships.' });
  }
});

router.post('/admin/subscriptions/:id/status', verifyToken, requireRole(['owner', 'dev']), async (req, res) => {
  try {
    const allowedStatuses = ['active', 'paused', 'cancelled'];
    if (!allowedStatuses.includes(req.body.status)) {
      return res.status(400).json({ error: 'Invalid membership status.' });
    }
    const existing = await pool.query(
      `SELECT * FROM maintenance_subscriptions WHERE id = $1`,
      [req.params.id]
    );
    if (!existing.rows.length) return res.status(404).json({ error: 'Membership not found.' });

    const stripeSubscriptionId = existing.rows[0].stripe_subscription_id;
    if (stripeSubscriptionId) {
      const stripe = initializeStripe();
      if (req.body.status === 'cancelled') {
        await stripe.subscriptions.cancel(stripeSubscriptionId);
      } else {
        await stripe.subscriptions.update(stripeSubscriptionId, {
          pause_collection: req.body.status === 'paused' ? { behavior: 'void' } : ''
        });
      }
    }
    const result = await pool.query(
      `UPDATE maintenance_subscriptions
       SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2
       RETURNING *`,
      [req.body.status, req.params.id]
    );
    return res.json({ subscription: result.rows[0] });
  } catch (error) {
    console.error('[Maintenance] Admin update error:', error.message);
    return res.status(500).json({ error: 'Unable to update membership.' });
  }
});

module.exports = {
  router,
  activateSubscriptionFromSession,
  MAINTENANCE_PLANS
};
