# Avina licence service

## Deploy

Run these commands from the repository root on the server:

```bash
cp .env.license.example .env
openssl rand -hex 32
```

Put the generated value in `.env` as `LICENSE_ADMIN_TOKEN`, then start the service:

```bash
docker compose --env-file .env -f docker-compose.license.yml up -d --build
docker compose --env-file .env -f docker-compose.license.yml ps
curl https://licence.sayahub.ir/health
```

The Compose port is bound to `127.0.0.1:8787`, so the existing reverse proxy should terminate HTTPS and forward `licence.sayahub.ir` to that address. Do not expose the container directly over plain HTTP.

The named Docker volume `avina_license_data` contains the SQLite database and the signing keys. Back it up securely; losing its private key invalidates the ability to issue compatible activation and recovery tokens.

## Configure the desktop public key

Retrieve the generated public key:

```bash
curl https://licence.sayahub.ir/v1/public-key
```

Use the returned PEM value as `LICENSE_PUBLIC_KEY` when building the desktop app, and use:

```bash
LICENSE_SERVICE_URL=https://licence.sayahub.ir
```

## Create and administer licences

Set these shell variables without placing the admin token in command history where possible:

```bash
export LICENCE_URL=https://licence.sayahub.ir
export LICENCE_ADMIN_TOKEN='the-value-from-your-server-.env'
```

Create a licence key for a client:

```bash
curl -sS -X POST "$LICENCE_URL/admin/licenses" \
  -H "Authorization: Bearer $LICENCE_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"label":"Client clinic name"}'
```

The plaintext `licenseKey` is returned only when it is created. Give that key to the client and retain it in your password manager.

List licences:

```bash
curl -sS "$LICENCE_URL/admin/licenses" \
  -H "Authorization: Bearer $LICENCE_ADMIN_TOKEN"
```

Allow an existing licence to move to a replacement PC:

```bash
curl -sS -X POST "$LICENCE_URL/admin/licenses/LICENCE_ID/reset-device" \
  -H "Authorization: Bearer $LICENCE_ADMIN_TOKEN"
```

Revoke a licence:

```bash
curl -sS -X POST "$LICENCE_URL/admin/licenses/LICENCE_ID/revoke" \
  -H "Authorization: Bearer $LICENCE_ADMIN_TOKEN"
```

Create a ten-minute password recovery code:

```bash
curl -sS -X POST "$LICENCE_URL/admin/recovery-codes" \
  -H "Authorization: Bearer $LICENCE_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"licenseId":"LICENCE_ID"}'
```

## Operations

```bash
docker compose --env-file .env -f docker-compose.license.yml logs -f license-api
docker compose --env-file .env -f docker-compose.license.yml restart license-api
docker compose --env-file .env -f docker-compose.license.yml pull
docker compose --env-file .env -f docker-compose.license.yml up -d --build
```

Never run `docker compose down -v` unless you intentionally want to delete all licences and signing keys.
