-- Create users table (unified authentication)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  role VARCHAR(50) DEFAULT 'customer',
  google_id VARCHAR(255) UNIQUE,
  oauth_provider VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create admins table (legacy - for backward compatibility)
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT true
);

-- Create bookings table
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name VARCHAR(255) NOT NULL,
  customer_email VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(20) NOT NULL,
  service_address VARCHAR(500) NOT NULL,
  service_type VARCHAR(255) NOT NULL,
  booking_date DATE NOT NULL,
  booking_time VARCHAR(20) NOT NULL,
  vehicle_type VARCHAR(50),
  notes TEXT,
  vehicle_photo TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  payment_status VARCHAR(50) DEFAULT 'unpaid',
  stripe_session_id VARCHAR(255),
  stripe_payment_intent_id VARCHAR(255),
  deposit_amount INTEGER DEFAULT 2500,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(booking_date, booking_time)
);

-- Create availability table
CREATE TABLE IF NOT EXISTS availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  day_of_week VARCHAR(10),
  is_available BOOLEAN DEFAULT true,
  service_type VARCHAR(50),
  start_time TIME,
  end_time TIME,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(date, service_type)
);

-- Add Stripe payment columns if they don't exist (for existing databases)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'payment_status') THEN
    ALTER TABLE bookings ADD COLUMN payment_status VARCHAR(50) DEFAULT 'unpaid';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'stripe_session_id') THEN
    ALTER TABLE bookings ADD COLUMN stripe_session_id TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'stripe_payment_intent_id') THEN
    ALTER TABLE bookings ADD COLUMN stripe_payment_intent_id TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'bookings' AND column_name = 'deposit_amount') THEN
    ALTER TABLE bookings ADD COLUMN deposit_amount INTEGER DEFAULT 2500;
  END IF;
END $$;

-- Create services table
CREATE TABLE IF NOT EXISTS services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price INTEGER NOT NULL,
  category VARCHAR(100),
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create add-ons table
CREATE TABLE IF NOT EXISTS addons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create gallery photos table
CREATE TABLE IF NOT EXISTS gallery_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename VARCHAR(255) NOT NULL,
  label VARCHAR(255),
  description TEXT,
  display_order INTEGER,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create blocked dates table
CREATE TABLE IF NOT EXISTS blocked_dates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocked_date DATE NOT NULL,
  blocked_time VARCHAR(20),
  reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(blocked_date, blocked_time)
);

-- Create site content table
CREATE TABLE IF NOT EXISTS site_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(255) UNIQUE NOT NULL,
  value TEXT,
  value_type VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create reviews table
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_name VARCHAR(255) NOT NULL,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,
  vehicle_type VARCHAR(100),
  service_type VARCHAR(255),
  is_featured BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create schedule table (business hours)
CREATE TABLE IF NOT EXISTS schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week VARCHAR(10) UNIQUE NOT NULL,
  is_open BOOLEAN DEFAULT true,
  start_time TIME DEFAULT '10:00:00',
  end_time TIME DEFAULT '18:00:00',
  is_mobile_day BOOLEAN DEFAULT true,
  is_shop_day BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create settings table
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_email VARCHAR(255),
  notification_email VARCHAR(255),
  business_phone VARCHAR(20),
  business_email VARCHAR(255),
  business_address VARCHAR(500),
  service_area VARCHAR(500),
  location_description TEXT,
  faq_text TEXT,
  homepage_headline VARCHAR(255),
  homepage_subheadline TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed default users
INSERT INTO users (email, password_hash, first_name, last_name, role, is_active) VALUES
  ('owner@geruso-detailing.com', '$2a$10$KIX3K.g7P6R5B7K8M9N0Q.H3I2J1K0L9M8N7O6P5Q4R3S2T1U0V', 'Cameron', 'Geruso', 'owner', true),
  ('dev@geruso-detailing.com', '$2a$10$KIX3K.g7P6R5B7K8M9N0Q.H3I2J1K0L9M8N7O6P5Q4R3S2T1U0V', 'Dev', 'Admin', 'dev', true),
  ('customer@example.com', '$2a$10$KIX3K.g7P6R5B7K8M9N0Q.H3I2J1K0L9M8N7O6P5Q4R3S2T1U0V', 'John', 'Doe', 'customer', true)
ON CONFLICT DO NOTHING;

-- Seed default services (if table is empty)
INSERT INTO services (name, description, price, category, is_active, display_order) VALUES
  ('Full Motorcycle Service', 'Complete motorcycle detailing service', 7000, 'Mobile', true, 1),
  ('Interior Detailing', 'Interior cleaning and detailing', 10000, 'Mobile', true, 2),
  ('Car Wash', 'Professional car washing', 8500, 'Mobile', true, 3),
  ('Ceramic Coating', 'Professional ceramic coating service', 40000, 'Location Only', true, 4),
  ('Premium Package', 'Premium detailing package', 17000, 'Mobile', true, 5),
  ('Ultra Premium', 'Ultra premium detailing package', 33500, 'Mobile', true, 6),
  ('Engine Bay Cleaning', 'Engine bay cleaning service', 7500, 'Mobile', true, 7),
  ('Full Vehicle Polish', 'Full vehicle polishing service', 25000, 'Location Only', true, 8)
ON CONFLICT DO NOTHING;

-- Seed default add-ons (if table is empty)
INSERT INTO addons (name, description, price, is_active, display_order) VALUES
  ('Pet Hair / Odor Elimination', 'Remove pet hair and odors', 5000, true, 1),
  ('Headlight Restoration', 'Restore headlight clarity', 5000, true, 2)
ON CONFLICT DO NOTHING;

-- Seed default schedule (business hours for all 7 days)
INSERT INTO schedule (day_of_week, is_open, start_time, end_time, is_mobile_day, is_shop_day) VALUES
  ('Monday', true, '10:00:00', '18:00:00', true, false),
  ('Tuesday', true, '10:00:00', '18:00:00', true, false),
  ('Wednesday', true, '10:00:00', '18:00:00', true, false),
  ('Thursday', true, '10:00:00', '18:00:00', true, false),
  ('Friday', true, '10:00:00', '18:00:00', true, false),
  ('Saturday', true, '10:00:00', '16:00:00', true, true),
  ('Sunday', false, '10:00:00', '16:00:00', false, false)
ON CONFLICT DO NOTHING;

-- Seed default settings
INSERT INTO settings (owner_email, notification_email, business_phone, business_email, business_address, service_area, location_description, homepage_headline, homepage_subheadline) VALUES
  (
    'owner@geruso-detailing.com',
    'notifications@geruso-detailing.com',
    '401-490-1236',
    'info@geruso-detailing.com',
    'North Providence, RI',
    'Rhode Island',
    'Mapleville, RI',
    'Your Vehicle, Perfected',
    'Professional car detailing services including washing, waxing, ceramic coating and more'
  )
ON CONFLICT DO NOTHING;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_bookings_date ON bookings(booking_date);
CREATE INDEX IF NOT EXISTS idx_bookings_email ON bookings(customer_email);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_bookings_payment_status ON bookings(payment_status);
CREATE INDEX IF NOT EXISTS idx_bookings_date_time ON bookings(booking_date, booking_time);
CREATE INDEX IF NOT EXISTS idx_bookings_stripe_session ON bookings(stripe_session_id);
CREATE INDEX IF NOT EXISTS idx_availability_date ON availability(date);
CREATE INDEX IF NOT EXISTS idx_admins_email ON admins(email);
CREATE INDEX IF NOT EXISTS idx_blocked_dates ON blocked_dates(blocked_date);
CREATE INDEX IF NOT EXISTS idx_gallery_order ON gallery_photos(display_order);
CREATE INDEX IF NOT EXISTS idx_reviews_active ON reviews(is_active);
CREATE INDEX IF NOT EXISTS idx_site_content_key ON site_content(key);
CREATE INDEX IF NOT EXISTS idx_schedule_day ON schedule(day_of_week);
CREATE INDEX IF NOT EXISTS idx_settings_id ON settings(id);
