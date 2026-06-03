# PDD Application — Production Deployment Guide

## Current Production Setup

- **Server**: `root@45.95.175.156`
- **App directory**: `/opt/pdd-app/`
- **Public URL**: `http://www.polozoffs.top/pdd/`
- **Internal port**: 8000 (container) → 8002 (host)
- **Reverse proxy**: Nginx Proxy Manager

## Prerequisites

- Docker 20.10+ and Docker Compose 2.0+
- SSH access to the server
- At least 2GB RAM and 5GB disk space

## First-Time Deployment

### 1. Copy files to server

```bash
rsync -av --exclude='node_modules' --exclude='dist' --exclude='__pycache__' \
  pdd_app/ root@45.95.175.156:/opt/pdd-app/
```

### 2. Set up data directory permissions

```bash
ssh root@45.95.175.156 "mkdir -p /opt/pdd-app/data && chmod 777 /opt/pdd-app/data"
```

### 3. Configure environment

```bash
ssh root@45.95.175.156 "cd /opt/pdd-app && cp .env.example .env"
# Then edit .env on the server and set a real SECRET_KEY:
ssh root@45.95.175.156 "nano /opt/pdd-app/.env"
```

### 4. Build and start

```bash
ssh root@45.95.175.156 "cd /opt/pdd-app && docker compose up -d --build"
```

### 5. Verify

```bash
ssh root@45.95.175.156 "docker logs pdd-app --tail 20"
curl http://45.95.175.156:8002/api/stats
```

## Routine Updates (redeploy after code changes)

```bash
# Copy updated files
rsync -av --exclude='node_modules' --exclude='dist' --exclude='__pycache__' \
  pdd_app/ root@45.95.175.156:/opt/pdd-app/

# Fix permissions — rsync copies files as your local UID (501/Mac user).
# The container's pddapp user needs write access to the data directory and DB.
ssh root@45.95.175.156 "chown -R root:root /opt/pdd-app/data && chmod 777 /opt/pdd-app/data && chmod 666 /opt/pdd-app/data/pdd.db"

# Rebuild and restart
ssh root@45.95.175.156 "cd /opt/pdd-app && docker compose up -d --build"
```

## Nginx Proxy Manager Configuration

The proxy config is managed inside the NPM container at `/data/nginx/proxy_host/`.

Key rules for the `/pdd/` sub-path setup:

```nginx
# Redirect root to /pdd/
location = / {
    return 302 /pdd/;
}

# Proxy API calls
location /api/ {
    proxy_pass http://172.17.0.1:8002;
}

# Proxy the app — NO trailing slash on proxy_pass (preserves /pdd/ prefix)
location /pdd/ {
    proxy_pass http://172.17.0.1:8002;
}
```

> **Important**: `proxy_pass http://172.17.0.1:8002;` must NOT have a trailing slash.
> A trailing slash causes NPM to strip the `/pdd/` prefix, triggering an infinite redirect loop.

## Dependency Notes

- **bcrypt is pinned to `3.2.2`** in `requirements.txt`. Do not upgrade to 4.x —
  `passlib 1.7.4`'s `detect_wrap_bug()` calls bcrypt with a 73-byte password which
  bcrypt ≥ 4.0 rejects with `ValueError`, crashing the container on startup.

## Admin Access

The **first user to register** is automatically assigned `role: admin`.

To promote an existing user to admin, or reset a password, use Python inside the container:

```bash
# Set admin role
ssh root@45.95.175.156 "docker exec pdd-app python3 -c \"
import sqlite3
conn = sqlite3.connect('/app/data/pdd.db')
conn.execute(\\\"UPDATE users SET role='admin' WHERE email='your@email.com'\\\")
conn.commit()
\""

# Reset password
ssh root@45.95.175.156 "docker exec pdd-app python3 -c \"
from passlib.context import CryptContext
import sqlite3
pwd = CryptContext(schemes=['bcrypt'], deprecated='auto').hash('newpassword')
conn = sqlite3.connect('/app/data/pdd.db')
conn.execute(\\\"UPDATE users SET password_hash=? WHERE email='your@email.com'\\\", (pwd,))
conn.commit()
\""
```

## Health Check

```bash
curl http://45.95.175.156:8002/api/stats
# Expected: {"total_questions": ..., "questions_with_images": ..., ...}
```

## Useful Commands

```bash
# View logs
ssh root@45.95.175.156 "docker logs pdd-app --tail 50 -f"

# Restart container
ssh root@45.95.175.156 "docker restart pdd-app"

# Shell into container
ssh root@45.95.175.156 "docker exec -it pdd-app bash"

# List users in DB
ssh root@45.95.175.156 "docker exec pdd-app python3 -c \"
import sqlite3
conn = sqlite3.connect('/app/data/pdd.db')
print(conn.execute('SELECT username, email, role FROM users').fetchall())
\""
```

