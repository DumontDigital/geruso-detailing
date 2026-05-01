# Services Quote Form - Testing Guide

## 🚀 Implementation Complete

Your Services page quote form is now fully implemented and ready for end-to-end testing. All components are in place and working together.

---

## 🔧 What Was Fixed in This Session

### 1. Server Validation Error
**Issue**: Form submission failed because server required `lastName` field
**Fix**: Updated `/api/quote` endpoint to only require `firstName`, `email`, and `phone`
```javascript
// Before:
if (!firstName || !lastName || !email || !phone) { ... }

// After:
if (!firstName || !email || !phone) { ... }
```

### 2. Google API Key Not Injected
**Issue**: services.html had hardcoded `YOUR_API_KEY` placeholder
**Fix**: Added route to inject `GOOGLE_PLACES_API_KEY` environment variable
```javascript
app.get('/services', (req, res) => {
  let servicesHtml = fs.readFileSync(...);
  servicesHtml = servicesHtml.replace('YOUR_API_KEY', process.env.GOOGLE_PLACES_API_KEY || 'YOUR_API_KEY');
  res.send(servicesHtml);
});
```

### 3. Quote Emails Missing Price Information
**Issue**: Quote emails didn't include service price
**Fix**: Enhanced `sendQuoteEmail()` to extract and display price
```javascript
const priceDisplay = extractPrice(service);
// Added to email template:
<p><strong>Estimated Price:</strong> ${priceDisplay}</p>
```

---

## 📋 Testing Checklist

### Before You Start
- [ ] Database is running and connected
- [ ] Environment variables are set:
  - `RESEND_API_KEY` (for email)
  - `OWNER_EMAIL` (recipient for quotes)
  - `FROM_EMAIL` (sender email)
  - `GOOGLE_PLACES_API_KEY` (for address autocomplete)
- [ ] Server is running locally or on Render

### Test Case 1: MOBILE Service (Interior Detailing)
```
Expected: Address field shows and is required
1. Open http://localhost:3000/services (or your Render URL)
2. Scroll to "Interior Detailing" card
3. Click "Book Now"
   ✓ Form should appear below
   ✓ Dropdown should show "Interior Detailing"
   ✓ Address field should be VISIBLE
   ✓ Red asterisk should show "Service Address *"
4. Fill in:
   - Name: "John Smith"
   - Email: "john@example.com"
   - Phone: "(401) 555-1234"
   - Address: "123 Main St, Providence, RI"
5. Click "Send Quote Request"
   ✓ Message should appear: "Quote request sent!"
   ✓ Form should reset and hide after 2 seconds
6. Check your email (OWNER_EMAIL inbox)
   ✓ Subject: "New Quote Request - John Smith"
   ✓ Should include:
     - Service: Interior Detailing
     - Price: Starting from $100
     - Address: 123 Main St, Providence, RI
     - Email and phone contact info
```

### Test Case 2: LOCATION ONLY Service (Ceramic Coating)
```
Expected: Address field hidden, location note visible
1. Click "Book Now" on "Ceramic Coating"
   ✓ Form should appear
   ✓ Dropdown should show "Ceramic Coating"
   ✓ Address field should be HIDDEN
   ✓ Location note should say: "This service is provided at our Mapleville location only..."
2. Fill in (NO address field):
   - Name: "Jane Doe"
   - Email: "jane@example.com"
   - Phone: "(401) 555-5678"
3. Click "Send Quote Request"
   ✓ Should submit successfully without address
4. Check email:
   ✓ Should NOT include any address
   ✓ Should include: Service name and price (Starting from $400)
```

### Test Case 3: EXTRA FEE Service (Pet Hair / Odor Elimination)
```
Expected: Address field shows and is required (like MOBILE)
1. Click "Book Now" on "Pet Hair / Odor Elimination"
   ✓ Address field should be VISIBLE (treated as mobile add-on)
2. Fill in all fields including address
3. Submit
   ✓ Should work like MOBILE services
```

### Test Case 4: Service Switching
```
Expected: Address field clears and toggles visibility
1. Click "Book Now" on "Car Wash" (MOBILE)
   ✓ Address field visible
2. Type "456 Oak St" in address field
   ✓ Text should appear in field
3. Click "Book Now" on "Ceramic Coating" (LOCATION ONLY)
   ✓ Address field should INSTANTLY HIDE
   ✓ Address field should be CLEARED (456 Oak St gone)
   ✓ Location note should APPEAR
4. Click "Book Now" on "Engine Bay Cleaning" (MOBILE)
   ✓ Address field should reappear
   ✓ Should be empty (cleared)
```

### Test Case 5: Form Validation
```
Expected: Form validates before sending
1. Click "Book Now" on any service
2. Leave "Full Name" empty
3. Click "Send Quote Request"
   ✓ Red error message: "Please fill in all required fields."
4. Fill name, leave email empty
5. Click "Send Quote Request"
   ✓ Same error appears (all three required)
6. Fill name and email, leave phone empty
7. Click "Send Quote Request"
   ✓ Error appears
8. For MOBILE service: fill name/email/phone, leave address empty
9. Click "Send Quote Request"
   ✓ Error: "Please enter a service address."
10. For LOCATION ONLY service: fill name/email/phone (no address)
11. Click "Send Quote Request"
    ✓ Should submit successfully (no address needed)
```

### Test Case 6: Address Autocomplete
```
Expected: Google Places suggestions appear and work
1. Click "Book Now" on a MOBILE service
2. Click in address field
3. Type: "123 main"
   ✓ Dropdown should appear below field
   ✓ Suggestions like "123 Main St, Providence, RI" should show
   ✓ Filtered to Rhode Island only
4. Click on suggestion
   ✓ Address field should populate
   ✓ Dropdown should close
5. Submit form
   ✓ Should work with autocompleted address
```

### Test Case 7: Mobile Responsiveness
```
Expected: Form works on mobile devices
1. Open DevTools (F12)
2. Toggle device toolbar (Ctrl+Shift+M or Cmd+Shift+M)
3. Set viewport to iPhone 12 (390x844)
4. Test form:
   ✓ All text readable
   ✓ Dropdown opens and works
   ✓ Address field is full width
   ✓ Address autocomplete dropdown is scrollable
   ✓ Buttons are large enough to tap
   ✓ Form elements don't overlap
5. Test at different sizes:
   ✓ 375px (small phone)
   ✓ 768px (tablet)
   ✓ 1280px (desktop)
```

### Test Case 8: All Services
Test that the dropdown includes all 10 services:
```
Services in dropdown:
- [ ] Full Motorcycle Service - $70
- [ ] Interior Detailing - Starting from $100
- [ ] Car Wash - Starting from $85
- [ ] Ceramic Coating - Starting from $400 (Location Only)
- [ ] Premium Package - Starting from $170
- [ ] Ultra Premium - $335
- [ ] Pet Hair / Odor Elimination - $50 Extra Fee
- [ ] Headlight Restoration - $50 per Headlight
- [ ] Engine Bay Cleaning - $75
- [ ] Full Vehicle Polish - Starting from $250 (Location Only)
```

---

## 🐛 Debugging Tips

### Check Browser Console
Open DevTools and look for these logs when testing:

```
[Services] Initializing quote form...
[Services] Book Now clicked
[Services] Selected service: Interior Detailing Tag: MOBILE
[Services] Quote form shown
[Services] Service dropdown set to: Interior Detailing
[Services] Address field: SHOWN (required)
[Services] Form submitted
[Services] Sending quote: { firstName: "John Smith", ... }
```

### Check Server Console
Look for these server logs:

```
[Quote API] POST /api/quote called
[Quote API] Request body: {...}
[Quote Email] Sending quote email: {...}
[Quote Email] Calling Resend API...
[Quote Email] SUCCESS - Email ID: msg_xxxxx
```

### If Autocomplete Doesn't Work
Check:
1. Is `GOOGLE_PLACES_API_KEY` set in environment?
2. Browser console shows: `[Services] Google Places Autocomplete` initialized?
3. No error messages like "Google Maps API not loaded"?
4. Check Google API key has Places API enabled

### If Email Doesn't Send
Check:
1. Is `RESEND_API_KEY` set?
2. Is `OWNER_EMAIL` set correctly?
3. Server console shows email API call succeeded?
4. Check OWNER_EMAIL inbox (including spam folder)

---

## 📊 Expected Behavior Summary

| Scenario | Address Field | Address Required | Can Submit | Email Includes Address |
|----------|---|---|---|---|
| MOBILE Service | VISIBLE | YES | Only if filled | YES |
| LOCATION ONLY | HIDDEN | NO | Yes (no address) | NO |
| EXTRA FEE Service | VISIBLE | YES | Only if filled | YES |
| No Service Selected | HIDDEN | NO | Only if filled | N/A |

---

## 🎯 Success Criteria

✅ Form appears when "Book Now" is clicked
✅ Service is pre-selected in dropdown
✅ Address field shows/hides correctly
✅ Form validates all required fields
✅ Address autocomplete works (if API key set)
✅ Form submission succeeds with success message
✅ Email is received at OWNER_EMAIL with correct details
✅ Service price is included in email
✅ Works on desktop, tablet, and mobile
✅ No JavaScript errors in console

---

## 🚀 Next Steps

1. **Run locally first** (if not already done)
   ```bash
   cd /Users/matheusdumont/geruso-detailing
   npm install
   npm start
   ```

2. **Test all scenarios** using this checklist

3. **Fix any issues** found during testing

4. **Deploy to Render**
   - Push changes to GitHub: `git push origin main`
   - Render will auto-deploy
   - Verify on live URL

5. **Monitor server logs** on Render dashboard for any quote submissions

---

## 📞 Support

If you encounter issues:

1. Check the debugging tips section above
2. Review the browser console for error messages
3. Check the server console/logs
4. Verify environment variables are set
5. Check that the quote endpoint is responding

---

## 📝 Notes

- The quote form is on the Services page (not a separate page)
- Quotes go to OWNER_EMAIL, not the customer
- Customer receives no automatic confirmation (they see "Quote request sent!" message)
- Address is optional for LOCATION ONLY services
- Address autocomplete filters to Rhode Island only
- Form hides automatically after successful submission
- All data is sent in a single POST request

---

**You're all set! Happy testing!** 🎉
