-- InstantDesk per-car rental booking calendar.
-- Apply after sql/create_rental_operations.sql.

create table if not exists rental_bookings (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  car_id uuid not null references cars(id) on delete cascade,
  customer_name text not null,
  customer_phone text,
  customer_email text,
  pickup_location_id uuid references rental_locations(id) on delete set null,
  dropoff_location_id uuid references rental_locations(id) on delete set null,
  pickup_at timestamptz not null,
  dropoff_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending','confirmed','active','completed','cancelled')),
  total_price numeric(10,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (dropoff_at > pickup_at)
);

create index if not exists rental_bookings_business_id_idx on rental_bookings (business_id);
create index if not exists rental_bookings_car_id_idx on rental_bookings (car_id);
create index if not exists rental_bookings_pickup_at_idx on rental_bookings (pickup_at);
create index if not exists rental_bookings_dropoff_at_idx on rental_bookings (dropoff_at);
create index if not exists rental_bookings_status_idx on rental_bookings (status);
create index if not exists rental_bookings_overlap_idx on rental_bookings (business_id, car_id, status, pickup_at, dropoff_at);

alter table rental_bookings enable row level security;

drop policy if exists "rental_bookings_owner_all" on rental_bookings;
create policy "rental_bookings_owner_all" on rental_bookings for all
  using (business_id = current_client_id())
  with check (business_id = current_client_id());
