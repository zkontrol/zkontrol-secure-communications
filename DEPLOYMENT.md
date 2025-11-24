# ZKONTROL Deployment Guide

This guide covers deploying ZKONTROL to production environments.

## Prerequisites

- Node.js 18 or higher
- PostgreSQL 14 or higher
- Domain name with SSL certificate
- Minimum 2GB RAM, 2 CPU cores

## Environment Setup

### 1. Clone Repository

```bash
git clone https://github.com/zkontrol/zkontrol-secure-communications.git
cd zkontrol-secure-communications
```

### 2. Install Dependencies

```bash
npm ci --production
```

### 3. Configure Environment Variables

Create a `.env` file in the root directory:

```env
# Production Database
DATABASE_URL=postgresql://user:password@production-host:5432/zkontrol
PGHOST=production-host
PGPORT=5432
PGUSER=zkontrol_user
PGPASSWORD=secure-password
PGDATABASE=zkontrol

# Session Security
SESSION_SECRET=use-a-long-random-string-here-at-least-32-chars

# AI Integration
AI_INTEGRATIONS_OPENAI_BASE_URL=https://api.openai.com/v1
AI_INTEGRATIONS_OPENAI_API_KEY=your-production-api-key

# Server
PORT=5000
NODE_ENV=production
```

### 4. Initialize Database

```bash
npm run db:push
```

### 5. Build Assets (if applicable)

```bash
# Currently no build step required
# Future: npm run build
```

## Deployment Options

### Option 1: Traditional VPS (DigitalOcean, Linode, etc.)

#### Setup Nginx Reverse Proxy

Create `/etc/nginx/sites-available/zkontrol`:

```nginx
upstream zkontrol_backend {
    server 127.0.0.1:5000;
}

server {
    listen 80;
    server_name zkontrol.io www.zkontrol.io;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name zkontrol.io www.zkontrol.io;

    ssl_certificate /etc/letsencrypt/live/zkontrol.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/zkontrol.io/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;

    location / {
        proxy_pass http://zkontrol_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # WebSocket support
        proxy_read_timeout 86400;
    }

    # Static assets
    location /assets/ {
        alias /var/www/zkontrol/assets/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

Enable the site:
```bash
sudo ln -s /etc/nginx/sites-available/zkontrol /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### Setup PM2 Process Manager

```bash
npm install -g pm2

# Start application
pm2 start server.js --name zkontrol

# Save PM2 configuration
pm2 save

# Enable PM2 on system startup
pm2 startup
```

#### Configure PM2 Ecosystem

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'zkontrol',
    script: './server.js',
    instances: 2,
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production',
      PORT: 5000
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};
```

Start with ecosystem:
```bash
pm2 start ecosystem.config.js
```

### Option 2: Docker Deployment

#### Dockerfile

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --production

# Copy application files
COPY . .

# Create logs directory
RUN mkdir -p logs

EXPOSE 5000

CMD ["node", "server.js"]
```

#### Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - SESSION_SECRET=${SESSION_SECRET}
      - AI_INTEGRATIONS_OPENAI_BASE_URL=${AI_INTEGRATIONS_OPENAI_BASE_URL}
      - AI_INTEGRATIONS_OPENAI_API_KEY=${AI_INTEGRATIONS_OPENAI_API_KEY}
    depends_on:
      - postgres
    restart: unless-stopped

  postgres:
    image: postgres:14-alpine
    environment:
      - POSTGRES_USER=zkontrol
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=zkontrol
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped

volumes:
  postgres_data:
```

Deploy:
```bash
docker-compose up -d
```

### Option 3: Cloud Platform (Railway, Render, etc.)

1. Connect GitHub repository
2. Set environment variables in platform dashboard
3. Configure build command: `npm ci`
4. Configure start command: `npm start`
5. Platform will handle deployment automatically

## Database Configuration

### PostgreSQL Production Setup

```sql
-- Create dedicated user
CREATE USER zkontrol WITH PASSWORD 'secure-password';

-- Create database
CREATE DATABASE zkontrol OWNER zkontrol;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE zkontrol TO zkontrol;
```

### Connection Pooling

For production, use connection pooling:

```javascript
// In server/storage.js or similar
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

## SSL/TLS Configuration

### Let's Encrypt (Free SSL)

```bash
# Install certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificate
sudo certbot --nginx -d zkontrol.io -d www.zkontrol.io

# Auto-renewal is configured automatically
# Test renewal
sudo certbot renew --dry-run
```

## Monitoring & Logging

### PM2 Monitoring

```bash
# View logs
pm2 logs zkontrol

# Monitor resources
pm2 monit

# View application info
pm2 info zkontrol
```

### Log Rotation

Create `/etc/logrotate.d/zkontrol`:

```
/var/www/zkontrol/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
    postrotate
        pm2 reloadLogs
    endscript
}
```

## Performance Optimization

### Enable Gzip Compression

Already configured in Nginx example above.

### CDN for Static Assets

Consider using Cloudflare or similar CDN for:
- `/assets/` directory
- Static website files
- Token icons

### Database Indexes

Ensure these indexes exist (already in schema):

```sql
CREATE INDEX IF NOT EXISTS idx_messages_room_id ON messages(room_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_expires_at ON messages(expires_at);
CREATE INDEX IF NOT EXISTS idx_room_members_user_id ON room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_reactions_message_id ON reactions(message_id);
```

## Security Checklist

- [ ] HTTPS enabled with valid SSL certificate
- [ ] Environment variables secured (not in version control)
- [ ] Database user has minimal required permissions
- [ ] Firewall configured (allow only 80, 443, 22)
- [ ] SSH access secured (key-based auth, no root login)
- [ ] Regular security updates enabled
- [ ] Database backups configured
- [ ] Rate limiting enabled (future)
- [ ] Security headers configured in Nginx
- [ ] CORS properly configured

## Backup Strategy

### Database Backups

```bash
# Create backup script /usr/local/bin/backup-zkontrol.sh
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/backups/zkontrol"
mkdir -p $BACKUP_DIR

# Backup database
pg_dump $DATABASE_URL > $BACKUP_DIR/zkontrol_$DATE.sql

# Compress backup
gzip $BACKUP_DIR/zkontrol_$DATE.sql

# Remove backups older than 30 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete

echo "Backup completed: zkontrol_$DATE.sql.gz"
```

Add to crontab:
```bash
# Daily backup at 2 AM
0 2 * * * /usr/local/bin/backup-zkontrol.sh
```

### Application Backups

```bash
# Backup application files
tar -czf /backups/zkontrol/app_$(date +%Y%m%d).tar.gz \
  /var/www/zkontrol \
  --exclude=node_modules \
  --exclude=logs
```

## Scaling

### Horizontal Scaling

To scale across multiple servers:

1. **Use Redis for sessions**:
```javascript
import RedisStore from 'connect-redis';
import { createClient } from 'redis';

const redisClient = createClient({
  url: process.env.REDIS_URL
});
redisClient.connect();

app.use(session({
  store: new RedisStore({ client: redisClient }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));
```

2. **Use Redis for Socket.io**:
```javascript
import { createAdapter } from '@socket.io/redis-adapter';

const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();

Promise.all([pubClient.connect(), subClient.connect()]);

io.adapter(createAdapter(pubClient, subClient));
```

3. **Load balancer configuration** (already in Nginx example)

## Troubleshooting

### Application Won't Start

```bash
# Check logs
pm2 logs zkontrol --lines 100

# Check environment variables
pm2 env zkontrol

# Verify database connection
psql $DATABASE_URL -c "SELECT version();"
```

### WebSocket Connection Issues

- Verify Nginx WebSocket configuration
- Check firewall allows WebSocket upgrades
- Ensure `proxy_read_timeout` is sufficient

### Database Connection Errors

- Verify DATABASE_URL format
- Check PostgreSQL is running
- Verify network connectivity
- Check connection limits: `SHOW max_connections;`

## Health Checks

Create `/health` endpoint:

```javascript
app.get('/health', async (req, res) => {
  try {
    await db.select().from(users).limit(1);
    res.json({ status: 'healthy', timestamp: new Date() });
  } catch (error) {
    res.status(500).json({ status: 'unhealthy', error: error.message });
  }
});
```

## CI/CD Pipeline

### GitHub Actions Example

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Deploy to server
        uses: appleboy/ssh-action@master
        with:
          host: ${{ secrets.SERVER_HOST }}
          username: ${{ secrets.SERVER_USER }}
          key: ${{ secrets.SSH_PRIVATE_KEY }}
          script: |
            cd /var/www/zkontrol
            git pull origin main
            npm ci --production
            npm run db:push
            pm2 restart zkontrol
```

## Post-Deployment Verification

```bash
# Check application is running
curl https://zkontrol.io/health

# Check WebSocket connection
wscat -c wss://zkontrol.io

# Monitor logs for errors
tail -f /var/www/zkontrol/logs/out.log

# Check database connectivity
psql $DATABASE_URL -c "\dt"
```

---

For deployment support, contact: dev@zkontrol.io
