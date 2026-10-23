const fs = require('fs');
const path = require('path');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
  };
}

function loadPayLaterHandler(pool, emailCapture) {
  const handlers = {};
  const express = {
    Router() {
      return {
        post(route, handler) { handlers[`POST ${route}`] = handler; },
        get(route, handler) { handlers[`GET ${route}`] = handler; },
      };
    }
  };
  const source = fs.readFileSync(path.join(__dirname, '..', 'routes/cart.js'), 'utf8');
  const routeModule = { exports: {} };
  const localRequire = request => {
    if (request === 'express') return express;
    if (request === 'uuid') return { v4: () => 'test-order-id' };
    if (request === '../db') return pool;
    if (request === '../stripe') return { initializeStripe() { return {}; } };
    if (request === '../email') {
      return {
        async sendBookingConfirmation(data) { emailCapture.customer = data; return { success: true }; },
        async sendOwnerNotification(data) { emailCapture.owner = data; return { success: true }; },
      };
    }
    if (request === '../js/promo-codes') return require('../js/promo-codes');
    throw new Error(`Unexpected require: ${request}`);
  };
  new Function('require', 'module', 'exports', source)(localRequire, routeModule, routeModule.exports);
  return handlers['POST /pay-later'];
}

async function testAdditionalServicesUpdateBooking() {
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      if (sql.includes('SELECT * FROM bookings')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'booking-1',
            service_type: 'Car Wash',
            payment_status: 'unpaid',
            status: 'pending',
            customer_name: 'Customer',
            customer_email: 'customer@example.com',
          }],
        };
      }
      if (sql.includes('UPDATE bookings')) {
        return {
          rowCount: 1,
          rows: [{
            id: 'booking-1',
            service_type: params[2],
            notes: params[3],
            payment_status: 'pay_later',
            status: 'confirmed',
            customer_name: 'Customer',
            customer_email: 'customer@example.com',
          }],
        };
      }
      throw new Error('Unexpected database query');
    }
  };
  const emailCapture = {};
  const handler = loadPayLaterHandler(pool, emailCapture);
  const response = createResponse();
  await handler({
    body: {
      customer: { bookingId: 'booking-1' },
      items: [
        { serviceName: 'Car Wash', price: 95, serviceTag: 'MOBILE' },
        { serviceName: 'Premium Wash', price: 130, serviceTag: 'MOBILE' },
        { serviceName: 'Engine Bay Cleaning', price: 75, serviceTag: 'EXTRA FEE' },
      ],
    },
  }, response);

  assert(response.statusCode === 200, `Expected successful checkout, received ${response.statusCode}`);
  assert(response.body.success === true, 'Checkout did not return success');
  assert(response.body.subtotal === 300 && response.body.total === 300, 'Additional-service total is incorrect');
  assert(calls[1].params[2] === 'Car Wash + Premium Wash', 'Booking service_type was not updated with both main services');
  assert(calls[1].params[3].includes('Add-ons: Engine Bay Cleaning'), 'Booking note did not include the add-on');
  assert(emailCapture.owner.serviceType === 'Car Wash + Premium Wash', 'Owner email did not receive updated services');
  assert(emailCapture.customer.notes.includes('Checkout selection:'), 'Customer email did not receive the checkout selection');
}

async function testLongServiceRequiresScheduling() {
  let updateCalled = false;
  const pool = {
    async query(sql) {
      if (sql.includes('SELECT * FROM bookings')) {
        return {
          rowCount: 1,
          rows: [{ id: 'booking-2', service_type: 'Car Wash', payment_status: 'unpaid', status: 'pending' }],
        };
      }
      updateCalled = true;
      throw new Error('Long-service checkout should not update the booking');
    }
  };
  const handler = loadPayLaterHandler(pool, {});
  const response = createResponse();
  await handler({
    body: {
      customer: { bookingId: 'booking-2' },
      items: [
        { serviceName: 'Car Wash', price: 95, serviceTag: 'MOBILE' },
        { serviceName: 'Ceramic Coating', price: 600, serviceTag: 'MOBILE' },
      ],
    },
  }, response);

  assert(response.statusCode === 400, 'New six-hour service was not rejected at checkout');
  assert(response.body.error.includes('six-hour appointment window'), 'Long-service rejection did not explain why rescheduling is required');
  assert(!updateCalled, 'Booking was updated after an invalid long-service addition');
}

(async () => {
  await testAdditionalServicesUpdateBooking();
  await testLongServiceRequiresScheduling();
  console.log('PASS checkout additions update booking services, add-ons, totals, and emails');
  console.log('PASS six-hour services cannot bypass scheduling requirements');
})().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
