/**
 * Geruso Detailing — Stripe Product Setup Script
 *
 * Run once to create all products, prices, and payment links in Stripe.
 * Usage: node scripts/setup-stripe-products.js
 *
 * This will output all the env variable values you need to copy into Render.
 */

require('dotenv').config();
const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ─── SERVICE CATALOG ─────────────────────────────────────────────────────────
// Must match the services in your database. Prices are full service amounts.
// The deposit is always $25 regardless of service.
const SERVICES = [
  { name: 'Full Motorcycle Service',  price: 7000,  category: 'Mobile',        description: 'Complete motorcycle detailing service' },
  { name: 'Interior Detailing',       price: 10000, category: 'Mobile',        description: 'Interior cleaning and detailing' },
  { name: 'Car Wash',                 price: 8500,  category: 'Mobile',        description: 'Professional car washing' },
  { name: 'Ceramic Coating',          price: 40000, category: 'Location Only', description: 'Professional ceramic coating service' },
  { name: 'Premium Package',          price: 17000, category: 'Mobile',        description: 'Premium detailing package' },
  { name: 'Ultra Premium',            price: 33500, category: 'Mobile',        description: 'Ultra premium detailing package' },
  { name: 'Engine Bay Cleaning',      price: 7500,  category: 'Mobile',        description: 'Engine bay cleaning service' },
  { name: 'Full Vehicle Polish',      price: 25000, category: 'Location Only', description: 'Full vehicle polishing service' },
];

const DEPOSIT_AMOUNT_CENTS = parseInt(process.env.DEPOSIT_AMOUNT_CENTS || '2500', 10); // $25.00

// ─── HELPERS ──────────────────────────────────────────────────────────────────
function toEnvKey(name) {
  return 'STRIPE_PRICE_' + name.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
}

function toProductKey(name) {
  return 'STRIPE_PRODUCT_' + name.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
}

function formatCents(cents) {
  return '$' + (cents / 100).toFixed(2);
}

// ─── MAIN SETUP ───────────────────────────────────────────────────────────────
async function setup() {
  console.log('\n=== Geruso Detailing — Stripe Product Setup ===\n');
  console.log(`Using key: ${process.env.STRIPE_SECRET_KEY?.startsWith('sk_live') ? 'LIVE' : 'TEST'}\n`);

  const envLines = [];
  const results = [];

  // ── 1. Create the $25 Booking Deposit product ──────────────────────────────
  console.log('Creating Booking Deposit product...');
  const depositProduct = await stripe.products.create({
    name: 'Booking Deposit — Geruso Detailing',
    description: 'Refundable $25 deposit required to confirm your detailing appointment.',
    metadata: { type: 'deposit', business: 'geruso_detailing' },
  });

  const depositPrice = await stripe.prices.create({
    product: depositProduct.id,
    unit_amount: DEPOSIT_AMOUNT_CENTS,
    currency: 'usd',
    metadata: { type: 'deposit' },
  });

  // Create a Payment Link for the deposit (can append ?client_reference_id=BOOKING_ID)
  const depositPaymentLink = await stripe.paymentLinks.create({
    line_items: [{ price: depositPrice.id, quantity: 1 }],
    metadata: { type: 'deposit', business: 'geruso_detailing' },
    after_completion: {
      type: 'redirect',
      redirect: {
        url: `${process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000'}/success?session_id={CHECKOUT_SESSION_ID}`,
      },
    },
  });

  console.log(`  Deposit Product: ${depositProduct.id}`);
  console.log(`  Deposit Price:   ${depositPrice.id}  (${formatCents(DEPOSIT_AMOUNT_CENTS)})`);
  console.log(`  Payment Link:    ${depositPaymentLink.url}\n`);

  envLines.push(`# Stripe Deposit Product`);
  envLines.push(`STRIPE_PRODUCT_DEPOSIT=${depositProduct.id}`);
  envLines.push(`STRIPE_PRICE_DEPOSIT=${depositPrice.id}`);
  envLines.push(`STRIPE_PAYMENT_LINK_DEPOSIT=${depositPaymentLink.url}`);
  envLines.push('');

  results.push({ name: 'Booking Deposit ($25)', productId: depositProduct.id, priceId: depositPrice.id, paymentLink: depositPaymentLink.url });

  // ── 2. Create each service as a Stripe product ─────────────────────────────
  console.log('Creating service products...');
  envLines.push(`# Stripe Service Products`);

  for (const service of SERVICES) {
    try {
      const product = await stripe.products.create({
        name: `${service.name} — Geruso Detailing`,
        description: service.description,
        metadata: {
          category: service.category,
          business: 'geruso_detailing',
          service_name: service.name,
        },
      });

      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: service.price,
        currency: 'usd',
        metadata: { service_name: service.name },
      });

      // Create a Payment Link for full-price payment (useful for final balance)
      const paymentLink = await stripe.paymentLinks.create({
        line_items: [{ price: price.id, quantity: 1 }],
        metadata: { service_name: service.name, type: 'full_payment' },
      });

      console.log(`  [OK] ${service.name}: product=${product.id}  price=${price.id}  link=${paymentLink.url}`);

      const pKey = toProductKey(service.name);
      const vKey = toEnvKey(service.name);
      const lKey = 'STRIPE_LINK_' + service.name.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();

      envLines.push(`${pKey}=${product.id}`);
      envLines.push(`${vKey}=${price.id}`);
      envLines.push(`${lKey}=${paymentLink.url}`);

      results.push({ name: service.name, price: service.price, productId: product.id, priceId: price.id, paymentLink: paymentLink.url });
    } catch (err) {
      console.error(`  [ERR] ${service.name}: ${err.message}`);
    }
  }

  // ── 3. Print the full .env block to copy ──────────────────────────────────
  console.log('\n\n════════════════════════════════════════════════════════════');
  console.log('  COPY THESE VALUES INTO YOUR RENDER ENVIRONMENT VARIABLES');
  console.log('════════════════════════════════════════════════════════════\n');
  console.log(envLines.join('\n'));

  // ── 4. Print a summary table ───────────────────────────────────────────────
  console.log('\n\n═══════════════════════ SUMMARY ════════════════════════════\n');
  console.log('Service                     | Price      | Payment Link');
  console.log('----------------------------|------------|------------------------------------------');
  for (const r of results) {
    const price = r.price ? formatCents(r.price) : ' $25.00 deposit';
    const name = r.name.padEnd(27);
    const priceStr = price.padEnd(10);
    console.log(`${name} | ${priceStr} | ${r.paymentLink}`);
  }
  console.log('\n✅ Setup complete! Add the env values above to Render and redeploy.');
  console.log('   Checkout sessions will now use pre-created Stripe products.\n');
}

setup().catch(err => {
  console.error('\n[FATAL] Setup failed:', err.message);
  if (err.message.includes('No API key')) {
    console.error('Make sure STRIPE_SECRET_KEY is set in your .env file.');
  }
  process.exit(1);
});
