# Double-Booking Prevention Test Plan

## Overview
This document verifies that the booking system prevents double-booking of the same date + time slot.

## Changes Made

### 1. Database Level (migrations/001_init_schema.sql)
- ✅ Added `UNIQUE(booking_date, booking_time)` constraint to bookings table
- ✅ Prevents PostgreSQL from accepting two bookings for identical date + time
- ✅ Added composite index `idx_bookings_date_time` for performance

### 2. Backend Level (routes/bookings.js)
- ✅ Created public endpoint `/api/bookings/public/booked-slots` (no auth required)
- ✅ Returns all booked date+time combinations (excluding cancelled bookings)
- ✅ Added error handling for constraint violation (error code 23505)
- ✅ Returns HTTP 409 Conflict with message: "This time was just booked. Please choose another slot."
- ✅ Enhanced logging to track double-booking attempts

### 3. Frontend Level (booking.html)
- ✅ Updated `loadBookedTimeSlots()` to use public endpoint
- ✅ Reloads booked slots after successful booking
- ✅ Handles 409 response with user-friendly error
- ✅ Auto-refreshes UI to show newly booked slot as unavailable
- ✅ Allows user to select different time after double-booking error

### 4. Admin Dashboard (admin-dashboard.html)
- ✅ Still shows all valid bookings (no changes needed)
- ✅ Can delete/cancel bookings to free up slots

## Test Scenarios

### Scenario 1: Sequential Bookings (Normal Case)
**Setup**: One user books 2PM on Friday
**Expected**: First booking succeeds, second attempt to same slot fails
**How to test**:
1. Open booking page, select Friday, 2PM
2. Fill form and submit
3. Verify: Success message appears
4. Open new browser tab/device, select same Friday 2PM
5. Fill form and submit
6. Verify: Error "This time was just booked. Please choose another slot."
7. Verify: Slot now shows as "Taken" (grayed out with red badge)
8. User can select different time and book successfully

### Scenario 2: Concurrent Requests (Race Condition)
**Setup**: Two users simultaneously submit bookings for same slot
**Expected**: One succeeds, one gets 409 error
**How to test**:
1. Use `curl` or Postman to simulate concurrent requests
2. Open two terminal windows
3. In both, prepare identical booking payload for same date+time
4. Send both requests within 1 second of each other
5. Verify: One gets 200 OK, one gets 409 Conflict
6. Verify: Database only has one booking (check admin dashboard)

**Example curl commands**:
```bash
# Terminal 1 - Request A
curl -X POST http://localhost:3000/api/bookings \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "Alice",
    "customerEmail": "alice@example.com",
    "customerPhone": "401-555-0001",
    "serviceAddress": "123 Main St, Providence",
    "serviceType": "Full Motorcycle Service",
    "bookingDate": "2026-05-09",
    "bookingTime": "2:00 PM",
    "vehicleType": "Car"
  }'

# Terminal 2 - Request B (same data)
curl -X POST http://localhost:3000/api/bookings \
  -H "Content-Type: application/json" \
  -d '{
    "customerName": "Bob",
    "customerEmail": "bob@example.com",
    "customerPhone": "401-555-0002",
    "serviceAddress": "456 Oak St, Warwick",
    "serviceType": "Full Motorcycle Service",
    "bookingDate": "2026-05-09",
    "bookingTime": "2:00 PM",
    "vehicleType": "Motorcycle"
  }'
```

### Scenario 3: Mobile + Desktop (Different Devices)
**Setup**: User on phone loads page, user on desktop loads same page
**Expected**: Both can see available slots, but only first to submit gets the time
**How to test**:
1. Open booking page on phone and desktop simultaneously
2. Both users select same Friday 2PM slot
3. Desktop user submits first (success)
4. Phone user submits second (409 error)
5. Phone automatically refreshes to show slot as taken
6. Phone user selects 3PM and books successfully

### Scenario 4: Cancelled Booking Becomes Available
**Setup**: A booking exists for Friday 2PM, then is cancelled
**Expected**: Friday 2PM becomes available again
**How to test**:
1. Log into admin dashboard
2. Find a booking for Friday 2PM
3. Click Edit, change status to "Cancelled"
4. Go back to booking page
5. Verify: Friday 2PM no longer shows as "Taken"
6. Customer can now book Friday 2PM

### Scenario 5: Database Constraint Enforcement
**Setup**: Directly attempt to insert duplicate booking in database
**Expected**: PostgreSQL rejects the insert
**How to test**:
```sql
-- Login to Render PostgreSQL
-- Verify constraint exists
SELECT constraint_name 
FROM information_schema.table_constraints 
WHERE table_name = 'bookings' AND constraint_type = 'UNIQUE';

-- Output should include: bookings_booking_date_booking_time_key

-- Verify it prevents duplicates
INSERT INTO bookings (id, customer_name, customer_email, customer_phone, 
  service_address, service_type, booking_date, booking_time, status)
VALUES (gen_random_uuid(), 'Test', 'test@example.com', '401-555-0000', 
  'Address', 'Service', '2026-05-09', '2:00 PM', 'pending');

-- Should fail if 2026-05-09 2:00 PM already exists
```

## Verification Checklist

- [ ] Database has UNIQUE constraint on (booking_date, booking_time)
- [ ] Public endpoint `/api/bookings/public/booked-slots` works
- [ ] First booking to a time slot succeeds with 200 OK
- [ ] Second booking to same slot fails with 409 Conflict
- [ ] Error message displayed: "This time was just booked. Please choose another slot."
- [ ] Slot updates to "Taken" after successful booking
- [ ] User can select different time after error
- [ ] Concurrent requests only create one booking
- [ ] Cancelled bookings free up their time slots
- [ ] Admin dashboard shows all non-cancelled bookings
- [ ] No emojis in UI (calendar uses red "Taken" badge instead)
- [ ] Mobile and desktop stay in sync
- [ ] Email confirmations only sent for successful bookings
- [ ] Owner notification email only sent for successful bookings

## Server Logs to Monitor

Look for these patterns in server logs during testing:

**Successful booking**:
```
[Bookings API] ✓ SUCCESS - Booking created and confirmed
[Bookings API] Booking details: { bookingId: '...', bookingDate: '2026-05-09', bookingTime: '2:00 PM', customerEmail: '...' }
```

**Double-booking attempt**:
```
[Bookings API] ⚠️ DOUBLE BOOKING ATTEMPT DETECTED!
[Bookings API] Conflict - Date: 2026-05-09 Time: 2:00 PM
[Bookings API] Attempted by: customer@example.com
```

## Expected HTTP Responses

### Successful Booking
```json
HTTP/1.1 200 OK
{
  "success": true,
  "message": "Booking confirmed! Check your email for details.",
  "booking": { ... }
}
```

### Double-Booking Attempt
```json
HTTP/1.1 409 Conflict
{
  "error": "This time was just booked. Please choose another slot.",
  "code": "TIME_SLOT_TAKEN",
  "conflictDate": "2026-05-09",
  "conflictTime": "2:00 PM"
}
```

## Performance Notes

- ✅ Unique constraint is enforced at database level (fastest)
- ✅ Composite index on (booking_date, booking_time) speeds up constraint check
- ✅ Public booked-slots endpoint uses indexed columns
- ✅ Frontend reloads only after each booking (not polling)
- ✅ No performance impact for normal operation

## Rollback/Safety

If issues arise:
1. Database constraint prevents invalid data - safe to rollback
2. 409 errors are gracefully handled by frontend
3. Public endpoint doesn't expose customer data
4. Original bookings are never lost (constraint prevents deletion)

## Timeline

- [ ] Run Scenario 1 (Sequential Bookings)
- [ ] Run Scenario 2 (Concurrent Requests with curl)
- [ ] Run Scenario 3 (Mobile + Desktop)
- [ ] Run Scenario 4 (Cancelled Booking)
- [ ] Run Scenario 5 (Database Constraint)
- [ ] Monitor server logs for issues
- [ ] Verify all checkboxes pass
- [ ] Deploy to production
