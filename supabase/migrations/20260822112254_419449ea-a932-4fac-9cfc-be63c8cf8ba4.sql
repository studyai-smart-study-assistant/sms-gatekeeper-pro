-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name TEXT,
  sms_paused BOOLEAN NOT NULL DEFAULT false,
  requests_per_minute INTEGER NOT NULL DEFAULT 60,
  sms_per_hour INTEGER NOT NULL DEFAULT 60,
  sms_per_day INTEGER NOT NULL DEFAULT 200,
  allow_backup_routing BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- gateway devices
CREATE TABLE public.gateway_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  gateway_device_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sender_number TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  enabled BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_backup BOOLEAN NOT NULL DEFAULT false,
  android_version TEXT,
  app_version TEXT,
  sms_permission TEXT NOT NULL DEFAULT 'unknown',
  sim_info JSONB,
  install_id TEXT,
  daily_sms_limit INTEGER NOT NULL DEFAULT 200,
  last_heartbeat_at TIMESTAMPTZ,
  paired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX gateway_devices_user_idx ON public.gateway_devices(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gateway_devices TO authenticated;
GRANT ALL ON public.gateway_devices TO service_role;
ALTER TABLE public.gateway_devices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "devices_own" ON public.gateway_devices FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER gateway_devices_updated_at BEFORE UPDATE ON public.gateway_devices
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- pairing codes
CREATE TABLE public.device_pairing_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  device_id UUID REFERENCES public.gateway_devices(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  device_name TEXT NOT NULL,
  sender_number TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX pairing_codes_hash_idx ON public.device_pairing_codes(code_hash);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.device_pairing_codes TO authenticated;
GRANT ALL ON public.device_pairing_codes TO service_role;
ALTER TABLE public.device_pairing_codes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pairing_own" ON public.device_pairing_codes FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- device credentials (server-only)
CREATE TABLE public.device_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES public.gateway_devices(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  install_id TEXT,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.device_credentials TO service_role;
ALTER TABLE public.device_credentials ENABLE ROW LEVEL SECURITY;

-- api keys
CREATE TABLE public.api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  key_hint TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  device_id UUID REFERENCES public.gateway_devices(id) ON DELETE SET NULL,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['sms:send'],
  requests_per_minute INTEGER NOT NULL DEFAULT 60,
  sms_per_day INTEGER NOT NULL DEFAULT 200,
  expires_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  last_used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX api_keys_user_idx ON public.api_keys(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_keys TO authenticated;
GRANT ALL ON public.api_keys TO service_role;
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "api_keys_own" ON public.api_keys FOR ALL TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- sms jobs
CREATE TABLE public.sms_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  device_id UUID REFERENCES public.gateway_devices(id) ON DELETE SET NULL,
  api_key_id UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  recipient TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  idempotency_key TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  claimed_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sms_jobs_idempotency_idx ON public.sms_jobs(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX sms_jobs_user_created_idx ON public.sms_jobs(user_id, created_at DESC);
CREATE INDEX sms_jobs_device_status_idx ON public.sms_jobs(device_id, status);
GRANT SELECT ON public.sms_jobs TO authenticated;
GRANT ALL ON public.sms_jobs TO service_role;
ALTER TABLE public.sms_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sms_jobs_select_own" ON public.sms_jobs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER sms_jobs_updated_at BEFORE UPDATE ON public.sms_jobs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- delivery events
CREATE TABLE public.sms_delivery_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.sms_jobs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  status TEXT NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sms_delivery_events_job_idx ON public.sms_delivery_events(job_id);
GRANT SELECT ON public.sms_delivery_events TO authenticated;
GRANT ALL ON public.sms_delivery_events TO service_role;
ALTER TABLE public.sms_delivery_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "events_select_own" ON public.sms_delivery_events FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- api request logs
CREATE TABLE public.api_request_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users ON DELETE CASCADE,
  api_key_id UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX api_request_logs_user_idx ON public.api_request_logs(user_id, created_at DESC);
GRANT SELECT ON public.api_request_logs TO authenticated;
GRANT ALL ON public.api_request_logs TO service_role;
ALTER TABLE public.api_request_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "logs_select_own" ON public.api_request_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- heartbeats
CREATE TABLE public.device_heartbeats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES public.gateway_devices(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  sms_permission TEXT,
  app_version TEXT,
  android_version TEXT,
  battery_level INTEGER,
  pending_jobs INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX device_heartbeats_device_idx ON public.device_heartbeats(device_id, created_at DESC);
GRANT SELECT ON public.device_heartbeats TO authenticated;
GRANT ALL ON public.device_heartbeats TO service_role;
ALTER TABLE public.device_heartbeats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "heartbeats_select_own" ON public.device_heartbeats FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- rate limit counters (server-only)
CREATE TABLE public.rate_limit_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  window_key TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX rate_limit_unique_idx ON public.rate_limit_counters(scope_type, scope_id, window_key);
GRANT ALL ON public.rate_limit_counters TO service_role;
ALTER TABLE public.rate_limit_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.bump_rate_limit(_scope_type TEXT, _scope_id TEXT, _window_key TEXT)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_count INTEGER;
BEGIN
  INSERT INTO public.rate_limit_counters (scope_type, scope_id, window_key, count)
  VALUES (_scope_type, _scope_id, _window_key, 1)
  ON CONFLICT (scope_type, scope_id, window_key)
  DO UPDATE SET count = public.rate_limit_counters.count + 1
  RETURNING count INTO new_count;
  RETURN new_count;
END; $$;
REVOKE ALL ON FUNCTION public.bump_rate_limit(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_rate_limit(TEXT, TEXT, TEXT) TO service_role;