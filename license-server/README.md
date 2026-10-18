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

## Updates and admin panel

Open `https://licence.sayahub.ir/admin` and sign in with `LICENSE_ADMIN_TOKEN`. The panel manages clients, licences, recovery/device resets, and release metadata. The public catalog is available at `GET /avina/update`, and electron-updater files are served from `/avina/update/windows/`. The permanent download URL `https://licence.sayahub.ir/avina/latest` serves the latest published Windows installer as an attachment without caching; it returns 404 if no release is published or its installer is missing.

Build a signed Windows release from the repository (the version must already match `package.json`):

```bash
UPDATE_BASE_URL=https://licence.sayahub.ir/avina/update/windows \
  npm run release:windows -- 1.1.0
```

This writes `latest.yml`, the NSIS installer, and its blockmap to the repository's `windows/` directory. Copy those files into the persistent service volume at `/data/updates/windows`. A production build still requires the release environment variables documented by `release:validate`, including the Windows code-signing certificate.

## Trial license

The shared trial key defaults to AVINA-TRIAL. Configure TRIAL_LICENSE_KEY and TRIAL_DURATION_HOURS=14 (hours; default 14) in the server .env and recreate the service with the Compose deploy command above. Duration changes apply to new trials; existing trials retain their original expiry.

Each machine fingerprint gets one fixed trial window. Re-entering the trial key before expiry resumes that same window, including after reconnecting or reinstalling; it never resets or extends the deadline. Once expired, the shared key is rejected. Trial records persist in the server database, so deleting local files or reinstalling does not reset eligibility. Keep the server volume and database backups. Changing the shared key does not reset eligibility. Hardware/OS identity changes can appear as a different machine.

Trials require HTTPS verification at startup and every 30 seconds (10-second request timeout), with signed server time and a fresh nonce; expiry is enforced using an in-process timer rather than the computer clock. When offline or expired, access locks and the internal server stops. A paid key can be entered on the activation screen; the same patient database and files are reused. Paid licenses retain their existing offline behavior.
