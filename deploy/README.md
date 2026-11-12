# Production deployment

Target: one Linux DigitalOcean droplet for the web app, database, and Caddy. The Windows scan worker is separate.

DigitalOcean Droplets are Linux only. Do not plan to run the Windows scan worker on the same droplet.

## Recommended split

| Component | Host |
|---|---|
| Web, API, admin | Ubuntu droplet, Docker Compose |
| MariaDB | MySQL-compatible container on the same droplet, or managed MySQL |
| TLS | Caddy on the droplet, or Cloudflare proxy |
| Scan worker | Windows VM at Azure, AWS or a Windows VPS |
| Egress | Linux gateway with a static IP, or a /28 provider |

## Droplet

- Ubuntu 24.04 LTS
- 2 vCPU, 4 GB RAM minimum
- 80 GB SSD
- Docker Engine and Compose plugin
- Firewall: 22 from your IP, 80 and 443 from the internet
- DNS A record for `DOMAIN` pointing at the droplet

## First deploy

```bash
git clone <repo> hackmywebsite
cd hackmywebsite/deploy
cp .env.production.example .env.production
# edit every secret and the domain
chmod +x backup-db.sh
docker compose --env-file .env.production up -d --build
docker compose --env-file .env.production ps
```

Caddy obtains a certificate automatically when DNS points at the droplet. The first build can take several minutes.

Health check:

```bash
curl -fsS https://app.example.com/api/health
```

## Production settings

- `ALLOW_DEV_LOGIN=0`
- `ALLOW_DEV_ADMIN=0`
- `ALLOW_DEV_PAYMENTS=0`
- `ALLOW_DEV_EMAIL=0`
- `ALLOW_DEV_VERIFICATION=0`
- `DEMO_MODE=0`
- Real `AUTH_SECRET`, `DELIVERY_CODE_PEPPER`, `WORKER_TOKEN_PEPPER` and `CRON_SECRET`
- Real Stripe and Resend keys
- `ADMIN_EMAILS` set to the owner account

Sign in with the admin email after deploy. The account is created on first magic-link sign-in.

## Worker

The worker runs on Windows outside this droplet:

```powershell
$env:HMW_WEB_URL='https://app.example.com'
$env:HMW_WORKER_TOKEN='the production worker token'
$env:HMW_RUNS_DIR='C:\hmw\runs'
node worker\worker.mjs
```

Use the NSSM instructions in `worker/README.md`. Register the same token hash in the portal. The local seed is for development only; production worker registration is still a manual admin task.

## Backups

```bash
cd deploy
./backup-db.sh
```

This keeps 14 daily database dumps. The encrypted report volume is separate. Add a volume backup or move reports to object storage before launch.

Manual restore:

```bash
gunzip -c backups/hmw-YYYYMMDDTHHMMSSZ.sql.gz | \
  docker compose --env-file .env.production exec -T db \
  mariadb -uroot -p"$MARIADB_ROOT_PASSWORD" "$MARIADB_DATABASE"
```

Test the restore on a staging droplet before launch.

## Updates

```bash
git pull
cd deploy
docker compose --env-file .env.production up -d --build
```

The `migrate` service runs `prisma migrate deploy` before the web container starts.

## Windows alternative

DigitalOcean does not sell Windows Server droplets. If Windows agents must stay, use a Windows VM from Azure, AWS or a Windows VPS and connect it outbound over HTTPS to this droplet. The worker needs no inbound ports.

A future Linux agent runtime is possible, but the current DSH runtime is Windows-only. That is a separate porting project.

## Not covered yet

- Managed MySQL and object storage migration.
- A real /28 egress range.
- Monitoring and alerting.
- Automated deploy rollback.
- SSL mode for the database.
- Multi-instance web hosting and Redis rate limits.
