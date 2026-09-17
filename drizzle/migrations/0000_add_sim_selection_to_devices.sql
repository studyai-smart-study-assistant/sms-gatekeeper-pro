ALTER TABLE public.gateway_devices
  ADD COLUMN IF NOT EXISTS sim_subscription_id integer,
  ADD COLUMN IF NOT EXISTS sim_slot integer,
  ADD COLUMN IF NOT EXISTS sim_label text;