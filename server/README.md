# Licensing server

This service contains no clinical data. It requires PostgreSQL and these environment variables:

- `DATABASE_URL`
- `LICENSE_PRIVATE_KEY` and `LICENSE_PUBLIC_KEY` (Ed25519 PEM)
- `ADMIN_API_TOKEN`
- `PORT` (optional, defaults to 8787)

Run it behind an HTTPS reverse proxy. Generate keys with:

```sh
openssl genpkey -algorithm ED25519 -out license-private.pem
openssl pkey -in license-private.pem -pubout -out license-public.pem
```

The administrative API token is a bootstrap mechanism. Production deployment should place the API behind the admin portal's MFA-protected session layer.

## Docker Compose deployment

The production Compose stack runs only the central licensing service and PostgreSQL. Clinical data stays on client computers.

```sh
./scripts/init-server-secrets.sh
docker compose -f compose.server.yml up -d --build
docker compose -f compose.server.yml ps
curl http://127.0.0.1:8787/health
```

The API is deliberately published only on server loopback. Put Nginx, Caddy, or another TLS reverse proxy in front of `127.0.0.1:8787`; never expose the container's HTTP port directly to the internet.

Create a client after HTTPS is configured:

```sh
ADMIN_TOKEN="$(cat secrets/admin_api_token.txt)"
curl -X POST https://license.example.com/v1/admin/clinics \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"username":"clinic-001","password":"replace-with-a-strong-password","maximumActivatedDevices":1,"passwordChangeRequired":false}'
```

Back up both the `postgres_data` volume and `secrets/license-private.pem`. Losing the signing key prevents issuance of licenses compatible with already-built desktop clients.

Useful operations:

```sh
docker compose -f compose.server.yml logs -f licensing
docker compose -f compose.server.yml restart licensing
docker compose -f compose.server.yml pull
docker compose -f compose.server.yml up -d --build
```
