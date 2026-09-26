CREATE TABLE IF NOT EXISTS clinics (
  id uuid PRIMARY KEY,
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  password_change_required boolean NOT NULL DEFAULT true,
  maximum_activated_devices integer NOT NULL DEFAULT 1 CHECK (maximum_activated_devices > 0),
  offline_days integer NOT NULL DEFAULT 7 CHECK (offline_days BETWEEN 1 AND 30),
  update_channel text NOT NULL DEFAULT 'stable',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS devices (
  id uuid PRIMARY KEY,
  clinic_id uuid NOT NULL REFERENCES clinics(id),
  installation_id uuid NOT NULL,
  public_key text NOT NULL,
  public_key_fingerprint text NOT NULL,
  label text NOT NULL,
  platform text NOT NULL,
  architecture text NOT NULL,
  app_version text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  activated_at timestamptz NOT NULL DEFAULT now(),
  last_validated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (clinic_id, installation_id),
  UNIQUE (public_key_fingerprint)
);

CREATE TABLE IF NOT EXISTS releases (
  id uuid PRIMARY KEY,
  channel text NOT NULL,
  platform text NOT NULL,
  architecture text NOT NULL,
  version text NOT NULL,
  minimum_version text NOT NULL,
  mandatory_after timestamptz,
  release_notes text NOT NULL DEFAULT '',
  artifact_url text NOT NULL CHECK (artifact_url LIKE 'https://%'),
  sha512 text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel, platform, architecture, version)
);

CREATE TABLE IF NOT EXISTS audit_events (
  id bigserial PRIMARY KEY,
  actor_type text NOT NULL,
  actor_id text NOT NULL,
  event_type text NOT NULL,
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_clinic_idx ON audit_events(target_id, occurred_at DESC);
