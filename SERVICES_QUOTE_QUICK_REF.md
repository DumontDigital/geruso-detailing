# Services Page Quote Form - Quick Reference

## What's New ✨

### Before
- Click "Book Now" → Links to contact.html
- No service-specific quote form
- Address field always visible on contact page

### After
- Click "Book Now" → Quote form appears on same page
- Form auto-populates service name
- Address field shows/hides based on service type
- Google Places Autocomplete for addresses
- All validation on the same page

---

## Service Type Rules

| Service Type | Address Field | Shows Location Note | Example |
|---|---|---|---|
| **MOBILE** | ✅ REQUIRED | ❌ No | Interior Detailing, Car Wash |
| **LOCATION ONLY** | ❌ HIDDEN | ✅ Yes | Ceramic Coating, Full Vehicle Polish |
| **EXTRA FEE** | ✅ REQUIRED | ❌ No | Pet Hair Removal, Headlight Restoration |
| **None Selected** | ❌ HIDDEN | ❌ No | Initial state |

---

## User Flow

```
┌─────────────────────────────────────┐
│  User Views Services Page           │
│  (See 10 service cards)             │
└────────────┬────────────────────────┘
             │
             │ Click "Book Now" button
             ↓
┌─────────────────────────────────────┐
│  Quote Form Appears Below           │
│  ├─ Service Name: [Auto-filled]     │
│  ├─ Full Name:    [Text input]      │
│  ├─ Email:        [Text input]      │
│  ├─ Phone:        [Text input]      │
│  ├─ Address:      [SMART: Show/Hide]│
│  ├─ Message:      [Optional]        │
│  └─ Submit:       [Green button]    │
└────────────┬────────────────────────┘
             │
      ┌──────┴──────┐
      ↓             ↓
  MOBILE        LOCATION ONLY
  Service        Service
  ├─ Show        ├─ Hide
  │ Address      │ Address
  └─ Field       └─ Show Note
     visible        visible
      │             │
      └──────┬──────┘
             │
             ↓
      [Customer Fills Form]
             │
             ↓
      [Click Submit]
             │
             ↓
      ✅ Quote Email Sent
```

---

## Address Field Logic

### When to SHOW Address
```
if (serviceType === 'MOBILE' || 
    serviceType === 'EXTRA FEE') {
  SHOW address field
  address field REQUIRED
}
```

**Services**:
- Full Motorcycle Service
- Interior Detailing
- Car Wash
- Premium Package
- Ultra Premium
- Engine Bay Cleaning
- Pet Hair / Odor Elimination
- Headlight Restoration

### When to HIDE Address
```
if (serviceType === 'LOCATION ONLY') {
  HIDE address field
  SHOW location note
  address field NOT required
  CLEAR any previous address
}
```

**Services**:
- Ceramic Coating
- Full Vehicle Polish

---

## Form Features

✅ **Auto-Population**
- Service name fills automatically
- Read-only field (can't be edited)

✅ **Smart Address Field**
- Shows only for mobile/extra fee services
- Required for MOBILE & EXTRA FEE
- Hidden for LOCATION ONLY
- Clears when switching services

✅ **Google Places Autocomplete**
- Type "123 Main" → suggestions appear
- Filters Rhode Island addresses
- Click to populate field
- Works on mobile

✅ **Validation**
- Name, email, phone required
- Address required (if field visible)
- Error messages shown instantly

✅ **Responsive**
- Works on phone, tablet, desktop
- Touch-friendly buttons
- Proper spacing on mobile

---

## Code Overview

### Service Type Detection
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

### Click Handler
```javascript
bookBtn.addEventListener('click', (e) => {
  e.preventDefault();
  selectService(serviceName);  // Show form
  scrollIntoView({ smooth });  // Jump to form
});
```

### Address Field Logic
```javascript
function updateAddressFieldVisibility(serviceType) {
  if (MOBILE or EXTRA FEE) {
    addressFieldGroup.display = 'block';
    addressInput.required = true;
  } else if (LOCATION ONLY) {
    addressFieldGroup.display = 'none';
    locationNote.display = 'block';
    addressInput.value = ''; // Clear!
  }
}
```

---

## Testing Quick Checks

### ✅ MOBILE Service
1. Click "Interior Detailing" card
2. Form appears with service name filled
3. Address field is VISIBLE
4. Type address → Autocomplete suggestions appear
5. Address field is REQUIRED (can't submit without it)

### ✅ LOCATION ONLY Service
1. Click "Ceramic Coating" card
2. Form appears with service name filled
3. Address field is HIDDEN
4. Location note is VISIBLE: "This service is provided at our Mapleville location only..."
5. Can submit without address

### ✅ EXTRA FEE Service
1. Click "Pet Hair / Odor Elimination" card
2. Form appears
3. Address field is VISIBLE (treated as mobile add-on)
4. Address field is REQUIRED

### ✅ Service Switching
1. Click "Car Wash" (MOBILE)
2. Address field shows
3. Type "123 Main St"
4. Click "Ceramic Coating" (LOCATION ONLY)
5. Address field HIDDEN instantly
6. Previous address CLEARED
7. Location note VISIBLE

---

## Customer Benefits

| Feature | Benefit |
|---|---|
| **On-Page Form** | No need to leave Services page |
| **Auto-Fill Service** | Faster quote request |
| **Smart Address Field** | Not confusing (only shows when needed) |
| **Autocomplete** | Easier address entry |
| **Instant Validation** | Know what's wrong before submit |
| **Mobile Friendly** | Works great on phones |

---

## Design Notes

- ✅ Uses neon green (#00FF41) accents
- ✅ Black background (#0a0a0a)
- ✅ Dark cards (#1a1a1a)
- ✅ Green focus state on inputs
- ✅ Consistent with booking.html style
- ✅ Mobile responsive (tested at 375px, 768px, 1280px)

---

## Form Submission

### What Gets Sent
```json
{
  "firstName": "John Doe",
  "email": "john@example.com",
  "phone": "(401) 555-1234",
  "service": "Interior Detailing",
  "message": "Address: 123 Main St, Providence, RI"
}
```

### Email Sent to Owner
- Subject: "New Quote Request - John Doe"
- Includes: Name, email, phone, service, address (if mobile), message

---

## Edge Cases Handled

✅ Service switching → Address clears  
✅ Clicking same service twice → Form resets  
✅ Google API not loaded → Graceful fallback  
✅ RI filter works → Only RI suggestions  
✅ Mobile autocomplete → Scrollable dropdown  
✅ Form validation → Error messages clear  
✅ Focus states → Green glow on inputs  
✅ Tab navigation → Works correctly  

---

## Files Modified

- **services.html** - Added quote form HTML, JavaScript, and styling

No other pages were changed. The contact.html page remains unchanged for users who want to request a general quote (not service-specific).

---

## What's the Same

✅ All service cards look the same  
✅ Navigation is the same  
✅ Footer is the same  
✅ Black background + neon green theme  
✅ Mobile hamburger menu  
✅ All other pages unchanged  

---

## Result

**Customers can now request a service-specific quote WITHOUT leaving the Services page, with smart address field management based on service type.** 🎉
