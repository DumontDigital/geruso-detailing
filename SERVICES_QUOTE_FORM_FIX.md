# Services Tab - Quote Form Fix ✅

## Issue Fixed

The Services page did not have a quote form that dynamically showed/hid the address field based on service type. Now when customers click on a service, a quote form appears with intelligent address field management.

---

## What Was Added

### 1. Dynamic Quote Form on Services Page
A new "Request a Quote" form section appears below the service cards with:
- Service name field (read-only, auto-populated)
- Full name input
- Email input
- Phone input
- **Smart Address Field** (shows/hides based on service type)
- Optional message textarea
- Submit button

### 2. Service Type Detection
The form automatically detects the service type from the service card:

```javascript
const serviceTypeMap = {
  'Full Motorcycle Service': 'MOBILE',
  'Interior Detailing': 'MOBILE',
  'Car Wash': 'MOBILE',
  'Ceramic Coating': 'LOCATION ONLY',
  'Premium Package': 'MOBILE',
  'Ultra Premium': 'MOBILE',
  'Pet Hair / Odor Elimination': 'EXTRA FEE',
  'Headlight Restoration': 'EXTRA FEE',
  'Engine Bay Cleaning': 'MOBILE',
  'Full Vehicle Polish': 'LOCATION ONLY'
};
```

### 3. Smart Address Field Logic

#### MOBILE Services (show address field):
- Full Motorcycle Service
- Interior Detailing
- Car Wash
- Premium Package
- Ultra Premium
- Engine Bay Cleaning

**Behavior**: Address field is **REQUIRED** and visible

#### LOCATION ONLY Services (hide address field):
- Ceramic Coating
- Full Vehicle Polish

**Behavior**: 
- Address field is **HIDDEN**
- Shows message: "This service is provided at our Mapleville location only. No address needed."
- Any previously entered address is cleared

#### EXTRA FEE Services (show address field):
- Pet Hair / Odor Elimination
- Headlight Restoration

**Behavior**: Address field is **REQUIRED** and visible (treated as mobile add-ons)

#### No Service Selected:
- Address field remains **HIDDEN**

---

## How It Works

### 1. Customer Clicks Service Card

```
[Service Card]
   ↓
[Click "Book Now" Button]
   ↓
selectService() triggered
   ↓
- Service name set in form
- Form scrolls into view
- Address field visibility updated
```

### 2. Form Populates Automatically

```javascript
function selectService(serviceName) {
  const serviceType = serviceTypeMap[serviceName];
  
  // Show quote form
  document.getElementById('quoteFormSection').style.display = 'block';
  
  // Populate service name
  document.getElementById('quoteService').value = serviceName;
  
  // Update address field visibility
  updateAddressFieldVisibility(serviceType);
  
  // Scroll to form
  scrollIntoView({ behavior: 'smooth' });
}
```

### 3. Address Field Shows/Hides Based on Service Type

```javascript
function updateAddressFieldVisibility(serviceType) {
  const addressFieldGroup = document.getElementById('addressFieldGroup');
  const locationNoteGroup = document.getElementById('locationNoteGroup');
  const serviceAddressInput = document.getElementById('serviceAddressInput');

  if (serviceType === 'MOBILE' || serviceType === 'EXTRA FEE') {
    // Show address field
    addressFieldGroup.style.display = 'block';
    locationNoteGroup.style.display = 'none';
    serviceAddressInput.required = true;
  } else if (serviceType === 'LOCATION ONLY') {
    // Hide address field + show location note
    addressFieldGroup.style.display = 'none';
    locationNoteGroup.style.display = 'block';
    serviceAddressInput.required = false;
    serviceAddressInput.value = ''; // Clear old address
  }
}
```

### 4. Customer Types Address (with Autocomplete)

```
[Address Input Field]
   ↓
[Type "123 Main"]
   ↓
Google Places API called
   ↓
[Autocomplete suggestions appear]
   ↓
[Click on address]
   ↓
[Address field populated]
```

### 5. Customer Switches Services

```
[Selected: "Interior Detailing" (MOBILE)]
   ↓
[Clicks another service card: "Ceramic Coating" (LOCATION ONLY)]
   ↓
selectService() called again
   ↓
- Form service name updates to "Ceramic Coating"
- Address field HIDDEN instantly
- Previous address CLEARED
- Location note displayed
```

---

## Features

### ✅ Address Autocomplete
- Uses Google Places API (Rhode Island filtered)
- Autocomplete suggestions appear as user types
- Clean styling with hover effects
- Works on mobile and desktop

### ✅ Real-Time Validation
- Checks required fields before submit
- Validates address is filled (if field is visible)
- Shows error messages

### ✅ Form State Management
- Service name auto-populates (read-only)
- Address field shows/hides based on service type
- Location note appears for location-only services
- Form scrolls into view when service selected

### ✅ Responsive Design
- Mobile-friendly styling
- Proper spacing and padding
- Touch-friendly buttons and inputs
- Autocomplete dropdown works on mobile

### ✅ User Feedback
- Success message after submission
- Error messages for validation failures
- Loading spinner during submission
- Form resets after successful submission

---

## User Experience Flow

### Scenario 1: MOBILE Service

```
Customer sees "Interior Detailing" card (tag: MOBILE)
                    ↓
            [Clicks "Book Now"]
                    ↓
        Form appears with title auto-filled
        "Interior Detailing"
                    ↓
         Address field is VISIBLE
         Placeholder: "Enter service address"
                    ↓
      Customer types address "123 Main St"
                    ↓
      Google Places suggestions appear:
      - 123 Main St, Providence, RI
      - 123 Main St, Warwick, RI
                    ↓
      Customer clicks suggestion
                    ↓
           Address field filled
                    ↓
         Fills other fields and submits
                    ↓
         Success: "Quote request sent!"
```

### Scenario 2: LOCATION ONLY Service

```
Customer sees "Ceramic Coating" card (tag: LOCATION ONLY)
                    ↓
            [Clicks "Book Now"]
                    ↓
        Form appears with title auto-filled
        "Ceramic Coating"
                    ↓
      Address field is HIDDEN
      Location note VISIBLE:
      "This service is provided at our
       Mapleville location only.
       No address needed."
                    ↓
      Fills name, email, phone, and submits
                    ↓
      Success: "Quote request sent!"
      (No address included in email)
```

### Scenario 3: Switching Services

```
Customer selects "Car Wash" (MOBILE)
   ├─ Address field VISIBLE
   └─ Enters "456 Oak St"

Customer changes mind, clicks "Ceramic Coating" (LOCATION ONLY)
   ├─ Service name updates
   ├─ Address field HIDDEN instantly
   ├─ Previous address CLEARED
   └─ Location note appears

Customer changes again, clicks "Pet Hair / Odor" (EXTRA FEE)
   ├─ Service name updates
   ├─ Address field VISIBLE again
   └─ Previous address cleared
```

---

## Form Submission

### Data Sent to Backend

```json
POST /api/quote
{
  "firstName": "John Doe",
  "lastName": "",
  "email": "john@example.com",
  "phone": "(401) 555-1234",
  "service": "Interior Detailing",
  "message": "Address: 123 Main St, Providence, RI"
}
```

### Email Sent to Owner

Subject: `New Quote Request - John Doe`

Body includes:
- Customer name
- Email address
- Phone number
- Service requested: "Interior Detailing"
- Service address (if applicable)
- Additional message

---

## Design & Styling

### Colors (Consistent with Site Theme)
- ✅ Black background: `#0a0a0a`
- ✅ Neon green accents: `#00FF41`
- ✅ Dark cards: `#1a1a1a`
- ✅ Green focus state: `box-shadow: 0 0 8px rgba(0,255,65,0.2)`

### Form Elements
- Input fields: Black background with green border on focus
- Address suggestions: Dark dropdown with green hover effects
- Submit button: Neon green with glowing hover effect
- Error messages: Red with transparent red background
- Success messages: Green with transparent green background

### Mobile Responsive
- Proper padding on mobile (24px section padding)
- Touch-friendly button size (14px+ padding)
- Full-width form on mobile
- Autocomplete dropdown works with touch scrolling

---

## How Address Field Is Managed

### Show Address Field
```javascript
addressFieldGroup.style.display = 'block';
serviceAddressInput.required = true;
// Shows: "Service Address *" with red asterisk
```

### Hide Address Field
```javascript
addressFieldGroup.style.display = 'none';
serviceAddressInput.required = false;
serviceAddressInput.value = ''; // Clear previous input
```

### Show Location Note
```javascript
locationNoteGroup.style.display = 'block';
// Shows: "This service is provided at our Mapleville location only..."
```

---

## Service Card Button Changes

**Before**:
```html
<a href="contact.html" class="btn-book">Book Now</a>
```

**After**:
```javascript
// "Book Now" button now calls selectService()
// instead of linking to contact.html
// Smooth scroll to quote form on same page
```

---

## Testing Checklist

### Form Display
- [ ] Click service card → Form appears
- [ ] Form scrolls into view smoothly
- [ ] Service name auto-populates (read-only)

### MOBILE Services
- [ ] "Full Motorcycle Service" → Address field SHOWS
- [ ] "Interior Detailing" → Address field SHOWS
- [ ] "Car Wash" → Address field SHOWS
- [ ] "Premium Package" → Address field SHOWS
- [ ] "Ultra Premium" → Address field SHOWS
- [ ] "Engine Bay Cleaning" → Address field SHOWS

### LOCATION ONLY Services
- [ ] "Ceramic Coating" → Address field HIDDEN, location note SHOWS
- [ ] "Full Vehicle Polish" → Address field HIDDEN, location note SHOWS

### EXTRA FEE Services
- [ ] "Pet Hair / Odor Elimination" → Address field SHOWS
- [ ] "Headlight Restoration" → Address field SHOWS

### Address Autocomplete
- [ ] Type in address field → Suggestions appear
- [ ] Filter works (RI only)
- [ ] Click suggestion → Field populated
- [ ] Works on mobile (scroll through dropdown)

### Service Switching
- [ ] Select MOBILE service
- [ ] Address field visible, type address
- [ ] Click different LOCATION ONLY service
- [ ] Address field HIDDEN instantly
- [ ] Previous address CLEARED
- [ ] Click back to MOBILE service
- [ ] Address field VISIBLE again

### Form Validation
- [ ] Submit without name → Error shown
- [ ] Submit without email → Error shown
- [ ] Submit without phone → Error shown
- [ ] Submit MOBILE without address → Error shown
- [ ] Submit LOCATION ONLY without address → Works (no error)
- [ ] Submit with all required fields → Success message

### Responsive Design
- [ ] Desktop: Form looks good, proper spacing
- [ ] Mobile (375px): Form is full-width, readable
- [ ] Mobile: Buttons are touch-friendly (large enough)
- [ ] Mobile: Autocomplete dropdown is scrollable

### Email Submission
- [ ] Quote email sent to owner
- [ ] Subject includes customer name
- [ ] Body includes service name
- [ ] Body includes address (if MOBILE service)
- [ ] No address shown (if LOCATION ONLY service)

---

## Files Modified

1. **services.html**
   - Added quote form HTML structure
   - Added service type detection mapping
   - Added address field visibility logic
   - Added Google Places Autocomplete integration
   - Added form submission handler
   - Added CSS styling for form elements

---

## What Didn't Change

✅ Service cards design and styling  
✅ Navigation and layout  
✅ Footer  
✅ Black background with neon green theme  
✅ Mobile hamburger menu  
✅ All other pages (index, work, memberships, etc.)  

---

## Summary

The Services page now has a fully functional, context-aware quote request form that:

- ✅ Auto-detects service type (MOBILE, LOCATION ONLY, EXTRA FEE)
- ✅ Shows/hides address field accordingly
- ✅ Provides Google Places Autocomplete for addresses
- ✅ Validates form before submission
- ✅ Scrolls form into view when service selected
- ✅ Clears address when switching services
- ✅ Shows user-friendly messages
- ✅ Works on mobile and desktop
- ✅ Maintains black/green design consistency

**Customers no longer need to leave the Services page to request a quote!**
