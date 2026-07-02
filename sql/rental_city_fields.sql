-- Additive multi-city support for Car Rental Ops.
-- Safe to run on existing deployments; current application code still derives
-- city from location names when these columns are empty.

alter table if exists cars
  add column if not exists city text;

alter table if exists rental_bookings
  add column if not exists city text;

alter table if exists rental_locations
  add column if not exists city text;

create index if not exists idx_cars_business_city
  on cars (business_id, city);

create index if not exists idx_rental_bookings_business_city
  on rental_bookings (business_id, city);

create index if not exists idx_rental_locations_business_city
  on rental_locations (business_id, city);
