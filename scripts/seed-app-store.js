// Seed the app store with 18 applications
const { Pool } = require('pg');

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://proberx:proberx@localhost:5432/proberx',
  });
  const WID = process.env.WID || '8219661e-92d1-47c5-9fd7-9c3579f9123e';

  // Clear existing
  await pool.query('DELETE FROM app_store_entries WHERE workspace_id = $1', [WID]);
  console.log('Cleared existing entries');

  const apps = [
    // DevOps
    { name: 'Nginx Proxy Manager', desc: 'Easy reverse proxy with SSL management. Expose your services with a few clicks.', cat: 'DevOps', icon: 'globe', mem: '256m', cpu: '0.5', ver: 'latest', author: 'jc21', hp: 'https://nginxproxymanager.com',
      yaml: 'services:\n  app:\n    image: jc21/nginx-proxy-manager:latest\n    container_name: "${APP_NAME}"\n    ports:\n      - "${PORT_80}:80"\n      - "${PORT_443}:443"\n      - "${PORT_81}:81"\n    volumes:\n      - ./data:/data\n      - ./letsencrypt:/etc/letsencrypt\n    restart: unless-stopped',
      env: { PORT_80: '8080', PORT_443: '8443', PORT_81: '8181' } },
    { name: 'Portainer', desc: 'Powerful Docker container management UI. Manage containers, images, networks and volumes.', cat: 'DevOps', icon: 'server', mem: '256m', cpu: '0.5', ver: 'CE', author: 'Portainer', hp: 'https://www.portainer.io',
      yaml: 'services:\n  app:\n    image: portainer/portainer-ce:latest\n    container_name: "${APP_NAME}"\n    ports:\n      - "${PORT}:9443"\n    volumes:\n      - /var/run/docker.sock:/var/run/docker.sock\n      - ./data:/data\n    restart: unless-stopped',
      env: { PORT: '9443' } },
    { name: 'Gitea', desc: 'Lightweight self-hosted Git service.', cat: 'DevOps', icon: 'git-branch', mem: '1g', cpu: '1.0', ver: 'latest', author: 'Gitea', hp: 'https://gitea.io',
      yaml: 'services:\n  app:\n    image: gitea/gitea:latest\n    container_name: "${APP_NAME}"\n    ports:\n      - "${WEB_PORT}:3000"\n      - "${SSH_PORT}:22"\n    volumes:\n      - ./data:/data\n      - /etc/timezone:/etc/timezone:ro\n      - /etc/localtime:/etc/localtime:ro\n    restart: unless-stopped',
      env: { SSH_PORT: '2222', WEB_PORT: '3000' } },
    // CMS
    { name: 'WordPress', desc: 'The worlds most popular CMS. Build websites with blocks, themes and plugins.', cat: 'CMS', icon: 'file-text', mem: '512m', cpu: '1.0', ver: 'latest', author: 'WordPress', hp: 'https://wordpress.org',
      yaml: 'services:\n  db:\n    image: mysql:8\n    container_name: "${APP_NAME}-db"\n    environment:\n      MYSQL_DATABASE: wordpress\n      MYSQL_USER: wordpress\n      MYSQL_PASSWORD: "${DB_PASSWORD}"\n      MYSQL_ROOT_PASSWORD: "${DB_ROOT_PASSWORD}"\n    volumes:\n      - ./db:/var/lib/mysql\n    restart: unless-stopped\n  app:\n    image: wordpress:latest\n    container_name: "${APP_NAME}"\n    ports:\n      - "${PORT}:80"\n    environment:\n      WORDPRESS_DB_HOST: db\n      WORDPRESS_DB_USER: wordpress\n      WORDPRESS_DB_PASSWORD: "${DB_PASSWORD}"\n      WORDPRESS_DB_NAME: wordpress\n    volumes:\n      - ./html:/var/www/html\n    depends_on:\n      - db\n    restart: unless-stopped',
      env: { PORT: '8080', DB_PASSWORD: 'changeme', DB_ROOT_PASSWORD: 'changeme' } },
    { name: 'Nextcloud', desc: 'Self-hosted file sharing and collaboration. Your own private cloud.', cat: 'CMS', icon: 'globe', mem: '512m', cpu: '1.0', ver: 'latest', author: 'Nextcloud', hp: 'https://nextcloud.com',
      yaml: 'services:\n  app:\n    image: nextcloud:latest\n    container_name: "${APP_NAME}"\n    ports:\n      - "${PORT}:80"\n    volumes:\n      - ./html:/var/www/html\n      - ./apps:/var/www/html/custom_apps\n      - ./config:/var/www/html/config\n      - ./data:/var/www/html/data\n    restart: unless-stopped',
      env: { PORT: '8080' } },
    { name: 'Strapi', desc: 'Headless CMS with a powerful admin panel.', cat: 'CMS', icon: 'file-text', mem: '512m', cpu: '1.0', ver: 'latest', author: 'Strapi', hp: 'https://strapi.io',
      yaml: 'services:\n  app:\n    image: strapi/strapi:latest\n    container_name: "${APP_NAME}"\n    ports:\n      - "${PORT}:1337"\n    volumes:\n      - ./app:/srv/app\n    environment:\n      DATABASE_CLIENT: sqlite\n      DATABASE_FILENAME: /srv/app/data.db\n    restart: unless-stopped',
      env: { PORT: '1337' } },
    { name: 'Directus', desc: 'Open-source data platform. Wrap any SQL database with a beautiful API.', cat: 'CMS', icon: 'grid', mem: '512m', cpu: '1.0', ver: 'latest', author: 'Directus', hp: 'https://directus.io',
      yaml: 'services:\n  app:\n    image: directus/directus:latest\n    container_name: "${APP_NAME}"\n    ports:\n      - "${PORT}:8055"\n    volumes:\n      - ./uploads:/directus/uploads\n      - ./database:/directus/database\n    environment:\n      ADMIN_EMAIL: "${ADMIN_EMAIL}"\n      ADMIN_PASSWORD: "${ADMIN_PASSWORD}"\n      KEY: "${KEY}"\n      SECRET: "${SECRET}"\n      DB_CLIENT: sqlite3\n      DB_FILENAME: /directus/database/data.db\n    restart: unless-stopped',
      env: { PORT: '8055', ADMIN_EMAIL: 'admin@example.com', ADMIN_PASSWORD: 'changeme', KEY: 'changeme', SECRET: 'changeme' } },
    { name: 'Outline', desc: 'Beautiful wiki and knowledge base for your team.', cat: 'CMS', icon: 'pen-tool', mem: '512m', cpu: '1.0', ver: 'latest', author: 'Outline', hp: 'https://www.getoutline.com',
      yaml: 'services:\n  db:\n    image: postgres:15-alpine\n    container_name: "${APP_NAME}-db"\n    environment:\n      POSTGRES_DB: outline\n      POSTGRES_USER: outline\n      POSTGRES_PASSWORD: "${PG_PASSWORD}"\n    volumes:\n      - ./db:/var/lib/postgresql/data\n    restart: unless-stopped\n  redis:\n    image: redis:7-alpine\n    container_name: "${APP_NAME}-redis"\n    restart: unless-stopped\n  app:\n    image: outlinewiki/outline:latest\n    container_name: "${APP_NAME}"\n    ports:\n      - "${PORT}:3000"\n    environment:\n      DATABASE_URL: postgres://outline:${PG_PASSWORD}@db:5432/outline\n      REDIS_URL: redis://redis:6379\n      SECRET_KEY: "${SECRET_KEY}"\n      UTILS_SECRET: "${UTILS_SECRET}"\n      URL: http://localhost:${PORT}\n    depends_on:\n      - db\n      - redis\n    restart: unless-stopped',
      env: { PORT: '3000', SECRET_KEY: 'changeme', UTILS_SECRET: 'changeme', PG_PASSWORD: 'changeme' } },
    // Monitoring
    { name: 'Uptime Kuma', desc: 'Fancy self-hosted uptime monitoring. Monitor HTTP(s), TCP, Ping, DNS and more.', cat: 'Monitoring', icon: 'activity', mem: '256m', cpu: '0.5', ver: 'latest', author: 'Louis Lam', hp: 'https://uptime.kuma.pet',
      yaml: 'services:\n  app:\n    image: louislam/uptime-kuma:latest\n    container_name: "${APP_NAME}"\n    ports:\n      - "${PORT}:3001"\n    volumes:\n      - ./data:/app/data\n    restart: unless-stopped',
      env: { PORT: '3001' } },
    { name: 'Plausible Analytics', desc: 'Privacy-friendly Google Analytics alternative.', cat: 'Monitoring', icon: 'bar-chart', mem: '1g', cpu: '1.0', ver: 'latest', author: 'Plausible', hp: 'https://plausible.io',
      yaml: 'services:\n  db:\n    image: postgres:15-alpine\n    container_name: "${APP_NAME}-db"\n    environment:\n      POSTGRES_DB: plausible\n      POSTGRES_USER: plausible\n      POSTGRES_PASSWORD: "${SECRET_KEY_BASE}"\n    volumes:\n      - ./db:/var/lib/postgresql/data\n    restart: unless-stopped\n  events:\n    image: clickhouse/clickhouse-server:23-alpine\n    container_name: "${APP_NAME}-events"\n    ulimits:\n      nofile: 262144\n    volumes:\n      - ./clickhouse:/var/lib/clickhouse\n    restart: unless-stopped\n  app:\n    image: plausible/analytics:latest\n    container_name: "${APP_NAME}"\n    ports:\n      - "${PORT}:8000"\n    environment:\n      BASE_URL: http://localhost:${PORT}\n      SECRET_KEY_BASE: "${SECRET_KEY_BASE}"\n      DATABASE_URL: postgres://plausible:${SECRET_KEY_BASE}@db:5432/plausible\n      CLICKHOUSE_URL: http://events:8123/plausible\n    depends_on:\n      - db\n      - events\n    restart: unless-stopped',
      env: { PORT: '8000', SECRET_KEY_BASE: 'changeme' } },
    { name: 'Grafana', desc: 'The open observability platform. Visualize metrics, logs, and traces.', cat: 'Monitoring', icon: 'activity', mem: '256m', cpu: '0.5', ver: 'latest', author: 'Grafana Labs', hp: 'https://grafana.com',
      yaml: 'services:\n  app:\n    image: grafana/grafana:latest\n    container_name: "${APP_NAME}"\n    ports:\n      - "${PORT}:3000"\n    volumes:\n      - ./data:/var/lib/grafana\n    restart: unless-stopped',
      env: { PORT: '3000' } },
    { name: 'Prometheus', desc: 'Powerful monitoring system and time series database.', cat: 'Monitoring', icon: 'bar-chart', mem: '512m', cpu: '1.0', ver: 'latest', author: 'Prometheus', hp: 'https://prometheus.io',
      yaml: 'services:\n  app:\n    image: prom/prometheus:latest\n    container_name: "${APP_NAME}"\n    ports:\n      - "${PORT}:9090"\n    volumes:\n      - ./data:/prometheus\n      - ./prometheus.yml:/etc/prometheus/prometheus.yml\n    command:\n      - "--config.file=/etc/prometheus/prometheus.yml"\n      - "--storage.tsdb.path=/prometheus"\n    restart: unless-stopped',
      env: { PORT: '9090' } },
    // Tools
    { name: 'NocoDB', desc: 'Open-source Airtable alternative. Turns any database into a smart spreadsheet.', cat: 'Tools', icon: 'grid', mem: '512m', cpu: '1.0', ver: 'latest', author: 'NocoDB', hp: 'https://nocodb.com',
      yaml: 'services:\n  db:\n    image: postgres:15-alpine\n    container_name: "${APP_NAME}-db"\n    environment:\n      POSTGRES_DB: nocodb\n      POSTGRES_USER: nocodb\n      POSTGRES_PASSWORD: changeme\n    volumes:\n      - ./db:/var/lib/postgresql/data\n    restart: unless-stopped\n  app:\n    image: nocodb/nocodb:latest\n    container_name: "${APP_NAME}"\n    ports:\n      - "${PORT}:8080"\n    environment:\n      NC_DB: pg://db:5432?u=nocodb&p=changeme&d=nocodb\n    depends_on:\n      - db\n    restart: unless-stopped',
      env: { PORT: '8080' } },
    { name: 'Vaultwarden', desc: 'Unofficial Bitwarden server. Lightweight password manager for teams.', cat: 'Tools', icon: 'lock', mem: '256m', cpu: '0.5', ver: 'latest', author: 'Vaultwarden', hp: 'https://github.com/dani-garcia/vaultwarden',
      yaml: 'services:\n  app:\n    image: vaultwarden/server:latest\n    container_name: "${APP_NAME}"\n    ports:\n      - "${PORT}:80"\n    volumes:\n      - ./data:/data\n    restart: unless-stopped',
      env: { PORT: '8080' } },
    { name: 'Mattermost', desc: 'Open-source Slack alternative. Secure team messaging and collaboration.', cat: 'Tools', icon: 'message-circle', mem: '512m', cpu: '1.0', ver: 'latest', author: 'Mattermost', hp: 'https://mattermost.com',
      yaml: 'services:\n  app:\n    image: mattermost/mattermost-team-edition:latest\n    container_name: "${APP_NAME}"\n    ports:\n      - "${PORT}:8065"\n    volumes:\n      - ./data:/mattermost/data\n      - ./config:/mattermost/config\n      - ./logs:/mattermost/logs\n      - ./plugins:/mattermost/plugins\n    restart: unless-stopped',
      env: { PORT: '8065' } },
    { name: 'Node-RED', desc: 'Flow-based programming for IoT. Wire together devices, APIs and services visually.', cat: 'Tools', icon: 'cpu', mem: '256m', cpu: '0.5', ver: 'latest', author: 'OpenJS Foundation', hp: 'https://nodered.org',
      yaml: 'services:\n  app:\n    image: nodered/node-red:latest\n    container_name: "${APP_NAME}"\n    ports:\n      - "${PORT}:1880"\n    volumes:\n      - ./data:/data\n    restart: unless-stopped',
      env: { PORT: '1880' } },
    // AI
    { name: 'Home Assistant', desc: 'Open-source home automation. Control lights, climate, media, and more.', cat: 'AI', icon: 'home', mem: '1g', cpu: '1.0', ver: 'latest', author: 'Home Assistant', hp: 'https://www.home-assistant.io',
      yaml: 'services:\n  app:\n    image: homeassistant/home-assistant:latest\n    container_name: "${APP_NAME}"\n    ports:\n      - "${PORT}:8123"\n    volumes:\n      - ./config:/config\n      - /etc/localtime:/etc/localtime:ro\n    restart: unless-stopped',
      env: { PORT: '8123' } },
    // Utility
    { name: 'Changedetection', desc: 'Monitor web pages for changes. Get notified when content updates.', cat: 'Monitoring', icon: 'refresh-cw', mem: '256m', cpu: '0.3', ver: 'latest', author: 'Changedetection', hp: 'https://changedetection.io',
      yaml: 'services:\n  app:\n    image: ghcr.io/dgtlmoon/changedetection.io:latest\n    container_name: "${APP_NAME}"\n    ports:\n      - "${PORT}:5000"\n    volumes:\n      - ./data:/datastore\n    restart: unless-stopped',
      env: { PORT: '5000' } },
  ];

  let count = 0;
  for (const app of apps) {
    await pool.query(
      `INSERT INTO app_store_entries (workspace_id, name, description, category, icon, compose_yaml, default_env, memory_limit, cpu_limit, version, author, homepage, is_enabled)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,true)`,
      [WID, app.name, app.desc, app.cat, app.icon, app.yaml, JSON.stringify(app.env), app.mem, app.cpu, app.ver, app.author, app.hp]
    );
    count++;
  }
  console.log('Seeded:', count, 'apps');
  const r = await pool.query('SELECT count(*) FROM app_store_entries');
  console.log('Total in DB:', r.rows[0].count);
  await pool.end();
}

main().catch(e => { console.error('ERR:', e.message); process.exit(1); });
