-- InstantDesk Car Rental Operations Assistant
-- Run in Supabase SQL editor. Tables are scoped by business_id.

alter table businesses
  add column if not exists business_type text not null default 'general';

create table if not exists rental_settings (
  business_id uuid primary key references businesses(id) on delete cascade,
  cleaning_buffer_minutes integer not null default 120,
  provider_name text,
  api_url text,
  api_key_encrypted text,
  sync_direction text not null default 'none'
    check (sync_direction in ('none','import','push','two_way')),
  webhook_url text,
  external_sync_enabled boolean not null default false,
  last_sync_at timestamptz,
  last_sync_status text,
  last_sync_error text,
  company_contact_name text,
  company_contact_email text,
  company_contact_phone text,
  terms_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table rental_settings
  add column if not exists currency text not null default 'PLN',
  add column if not exists minimum_rental_duration text,
  add column if not exists deposit_policy text,
  add column if not exists cancellation_policy text,
  add column if not exists return_policy text,
  add column if not exists late_return_policy text,
  add column if not exists fuel_policy text,
  add column if not exists mileage_policy text,
  add column if not exists cross_border_policy text,
  add column if not exists pickup_dropoff_rules text,
  add column if not exists required_documents_text text,
  add column if not exists insurance_extras_notes text,
  add column if not exists company_whatsapp text,
  add column if not exists company_website text;

create table if not exists rental_locations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  address text,
  google_maps_link text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  terminal_instructions text,
  image_url text,
  whatsapp_text text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table rental_locations
  add column if not exists location_type text not null default 'both',
  add column if not exists pickup_instruction_text text,
  add column if not exists dropoff_instruction_text text;

create table if not exists car_classes (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  sort_order integer not null default 100,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists cars (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  car_class_id uuid references car_classes(id) on delete set null,
  location_id uuid references rental_locations(id) on delete set null,
  name text not null,
  model text,
  transmission text check (transmission in ('manual','automatic')),
  seats integer,
  fuel_type text,
  daily_price numeric(10,2) not null default 0,
  deposit numeric(10,2) not null default 0,
  status text not null default 'available'
    check (status in ('available','pending','confirmed','paid','picked_up','returned','extended','cancelled','maintenance','inactive')),
  image_url text,
  license_plate text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists car_pricing (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  car_id uuid references cars(id) on delete cascade,
  car_class_id uuid references car_classes(id) on delete cascade,
  label text not null default 'Standard',
  daily_price numeric(10,2) not null,
  deposit numeric(10,2) not null default 0,
  valid_from date,
  valid_to date,
  min_days integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists rental_customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  date_of_birth date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  booking_number text not null,
  customer_id uuid references rental_customers(id) on delete set null,
  car_id uuid references cars(id) on delete set null,
  car_class_id uuid references car_classes(id) on delete set null,
  pickup_location_id uuid references rental_locations(id) on delete set null,
  dropoff_location_id uuid references rental_locations(id) on delete set null,
  pickup_at timestamptz not null,
  return_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending','confirmed','paid','picked_up','returned','extended','cancelled','maintenance')),
  extras jsonb not null default '[]'::jsonb,
  daily_price numeric(10,2) not null default 0,
  deposit numeric(10,2) not null default 0,
  total_price numeric(10,2) not null default 0,
  payment_status text not null default 'unpaid',
  external_booking_id text,
  source text not null default 'instantdesk',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id, booking_number)
);

create table if not exists booking_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  booking_id uuid references bookings(id) on delete cascade,
  event_type text not null,
  description text,
  old_value jsonb,
  new_value jsonb,
  actor text,
  created_at timestamptz not null default now()
);

create table if not exists rental_documents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  customer_id uuid references rental_customers(id) on delete cascade,
  booking_id uuid references bookings(id) on delete set null,
  document_type text not null check (document_type in ('driver_license','passport','id_card','other')),
  file_url text,
  consent_given boolean not null default false,
  ocr_status text not null default 'pending'
    check (ocr_status in ('pending','processed','failed','human_review')),
  ocr_confidence numeric(5,2),
  extracted_name text,
  document_number text,
  expiry_date date,
  date_of_birth date,
  validation_status text not null default 'missing'
    check (validation_status in ('missing','valid','expired','invalid','needs_review')),
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists rental_external_sync_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  provider_name text,
  direction text not null,
  status text not null,
  message text,
  payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists cars_business_status_idx on cars (business_id, active, status);
create index if not exists bookings_business_window_idx on bookings (business_id, pickup_at, return_at, status);
create index if not exists booking_logs_business_booking_idx on booking_logs (business_id, booking_id, created_at desc);
create index if not exists rental_documents_business_booking_idx on rental_documents (business_id, booking_id, validation_status);

alter table rental_settings enable row level security;
alter table rental_locations enable row level security;
alter table car_classes enable row level security;
alter table cars enable row level security;
alter table car_pricing enable row level security;
alter table rental_customers enable row level security;
alter table bookings enable row level security;
alter table booking_logs enable row level security;
alter table rental_documents enable row level security;
alter table rental_external_sync_logs enable row level security;

drop policy if exists "rental_settings_owner_all" on rental_settings;
create policy "rental_settings_owner_all" on rental_settings for all
  using (business_id = current_client_id()) with check (business_id = current_client_id());

drop policy if exists "rental_locations_owner_all" on rental_locations;
create policy "rental_locations_owner_all" on rental_locations for all
  using (business_id = current_client_id()) with check (business_id = current_client_id());

drop policy if exists "car_classes_owner_all" on car_classes;
create policy "car_classes_owner_all" on car_classes for all
  using (business_id = current_client_id()) with check (business_id = current_client_id());

drop policy if exists "cars_owner_all" on cars;
create policy "cars_owner_all" on cars for all
  using (business_id = current_client_id()) with check (business_id = current_client_id());

drop policy if exists "car_pricing_owner_all" on car_pricing;
create policy "car_pricing_owner_all" on car_pricing for all
  using (business_id = current_client_id()) with check (business_id = current_client_id());

drop policy if exists "rental_customers_owner_all" on rental_customers;
create policy "rental_customers_owner_all" on rental_customers for all
  using (business_id = current_client_id()) with check (business_id = current_client_id());

drop policy if exists "bookings_owner_all" on bookings;
create policy "bookings_owner_all" on bookings for all
  using (business_id = current_client_id()) with check (business_id = current_client_id());

drop policy if exists "booking_logs_owner_all" on booking_logs;
create policy "booking_logs_owner_all" on booking_logs for all
  using (business_id = current_client_id()) with check (business_id = current_client_id());

drop policy if exists "rental_documents_owner_all" on rental_documents;
create policy "rental_documents_owner_all" on rental_documents for all
  using (business_id = current_client_id()) with check (business_id = current_client_id());

drop policy if exists "rental_external_sync_logs_owner_all" on rental_external_sync_logs;
create policy "rental_external_sync_logs_owner_all" on rental_external_sync_logs for all
  using (business_id = current_client_id()) with check (business_id = current_client_id());
