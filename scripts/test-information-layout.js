function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function includes(file, text) {
  return readFile(file).includes(text);
}

assert(includes('services.html', 'class="service-guidance"'), 'Services guidance section is missing');
assert(includes('services.html', 'Every main service: Mobile or Geruso Location'), 'Services location instructions were removed');
assert(includes('services.html', 'One cart and checkout'), 'Services add-on checkout instructions were removed');
assert(includes('services.html', 'Water access needed at the service address'), 'Services water-access instructions were removed');
assert(includes('services.html', 'Biweekly: $100 per visit'), 'Biweekly maintenance pricing was removed');
assert(includes('services.html', 'Monthly: $150'), 'Monthly maintenance pricing was removed');

assert(includes('schedule.html', 'class="schedule-overview"'), 'Schedule overview section is missing');
assert(includes('schedule.html', 'Mobile appointments are available Thursday and Friday.'), 'Mobile schedule instructions were removed');
assert(includes('schedule.html', 'Geruso Location appointments are available Saturday and Sunday by appointment only.'), 'Location schedule instructions were removed');
assert(includes('schedule.html', 'Fill out your information and select a package.'), 'Booking-order instructions were removed');
assert(includes('schedule.html', 'Rhode Island, Worcester-area MA towns, and northeast CT towns.'), 'Mobile service-area instructions were removed');

assert(includes('checkout.html', 'class="residence-notice-label"'), 'Residence notice presentation is missing');
assert(includes('checkout.html', 'No customer waiting area'), 'Residence waiting-area instructions were removed');
assert(includes('checkout.html', 'Arrange a ride after drop-off and back for pickup'), 'Residence ride instructions were removed');
assert(includes('checkout.html', 'Pay-after-service bookings are confirmed now and paid after the appointment.'), 'Payment timing instructions were removed');

assert(includes('contact.html', 'class="appointment-policy"'), 'Contact appointment policy styling is missing');
assert(includes('contact.html', 'By appointment only. No walk-ins.'), 'Contact appointment policy was removed');
assert(includes('memberships.html', 'class="membership-note"'), 'Membership guidance card is missing');
assert(includes('memberships.html', 'continue to secure Stripe Checkout to start recurring service'), 'Membership checkout instructions were removed');

print('PASS informational notes use structured presentation blocks');
print('PASS scheduling, location, ride, payment, and membership instructions remain intact');
