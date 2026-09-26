#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
secret_dir="$project_dir/secrets"
mkdir -p "$secret_dir"
chmod 700 "$secret_dir"

for required_command in openssl; do
  command -v "$required_command" >/dev/null || { echo "$required_command is required" >&2; exit 1; }
done

if [[ ! -e "$secret_dir/postgres_password.txt" ]]; then
  openssl rand -hex 24 > "$secret_dir/postgres_password.txt"
fi
if [[ ! -e "$secret_dir/admin_api_token.txt" ]]; then
  openssl rand -hex 32 > "$secret_dir/admin_api_token.txt"
fi
if [[ ! -e "$secret_dir/license-private.pem" ]]; then
  openssl genpkey -algorithm ED25519 -out "$secret_dir/license-private.pem"
  openssl pkey -in "$secret_dir/license-private.pem" -pubout -out "$secret_dir/license-public.pem"
fi

database_password="$(tr -d '\r\n' < "$secret_dir/postgres_password.txt")"
printf 'postgresql://avina_license:%s@postgres:5432/avina_license\n' "$database_password" > "$secret_dir/database_url.txt"
chmod 600 "$secret_dir"/*

echo "Server secrets created in $secret_dir"
echo "Keep this directory private and back up license-private.pem securely."
echo "Admin token: $(tr -d '\r\n' < "$secret_dir/admin_api_token.txt")"
