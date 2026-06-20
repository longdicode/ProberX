import { eq, and, desc, ilike, or } from "drizzle-orm";
import { appStoreEntries } from "../db/schema/app-store";
import { AppError } from "../utils/errors";
import type { DbClient } from "../db/index";
import type { CreateAppStoreEntryInput, UpdateAppStoreEntryInput } from "../validators/app-store";

export async function list(
  workspaceId: string,
  db: DbClient,
  opts?: { category?: string; search?: string; limit?: number },
) {
  const conditions: ReturnType<typeof eq>[] = [
    eq(appStoreEntries.workspaceId, workspaceId),
    eq(appStoreEntries.isEnabled, true),
  ];
  if (opts?.category && opts.category !== "all") {
    conditions.push(eq(appStoreEntries.category, opts.category));
  }
  if (opts?.search) {
    const term = `%${opts.search}%`;
    conditions.push(
      or(ilike(appStoreEntries.name, term), ilike(appStoreEntries.description, term))!,
    );
  }
  return db.select()
    .from(appStoreEntries)
    .where(and(...conditions))
    .orderBy(desc(appStoreEntries.createdAt))
    .limit(opts?.limit ?? 100);
}

export async function getById(workspaceId: string, entryId: string, db: DbClient) {
  const [entry] = await db.select()
    .from(appStoreEntries)
    .where(and(eq(appStoreEntries.id, entryId), eq(appStoreEntries.workspaceId, workspaceId)))
    .limit(1);
  if (!entry) throw AppError.notFound("App store entry", entryId);
  return entry;
}

export async function create(workspaceId: string, input: CreateAppStoreEntryInput, db: DbClient) {
  const [entry] = await db.insert(appStoreEntries).values({
    workspaceId,
    name: input.name,
    description: input.description ?? null,
    category: input.category ?? "Tools",
    icon: input.icon ?? "package",
    composeYaml: input.composeYaml,
    defaultEnv: input.defaultEnv ?? {},
    memoryLimit: input.memoryLimit ?? null,
    cpuLimit: input.cpuLimit ?? null,
    logoUrl: input.logoUrl ?? null,
    version: input.version ?? null,
    author: input.author ?? null,
    homepage: input.homepage ?? null,
    isEnabled: input.isEnabled ?? true,
  }).returning();
  return entry;
}

export async function update(workspaceId: string, entryId: string, input: UpdateAppStoreEntryInput, db: DbClient) {
  const existing = await getById(workspaceId, entryId, db);
  const [updated] = await db.update(appStoreEntries)
    .set({
      name: input.name ?? existing.name,
      description: input.description !== undefined ? input.description : existing.description,
      category: input.category ?? existing.category,
      icon: input.icon ?? existing.icon,
      composeYaml: input.composeYaml ?? existing.composeYaml,
      defaultEnv: input.defaultEnv !== undefined ? input.defaultEnv : existing.defaultEnv,
      memoryLimit: input.memoryLimit !== undefined ? input.memoryLimit : existing.memoryLimit,
      cpuLimit: input.cpuLimit !== undefined ? input.cpuLimit : existing.cpuLimit,
      logoUrl: input.logoUrl !== undefined ? input.logoUrl : existing.logoUrl,
      version: input.version !== undefined ? input.version : existing.version,
      author: input.author !== undefined ? input.author : existing.author,
      homepage: input.homepage !== undefined ? input.homepage : existing.homepage,
      isEnabled: input.isEnabled ?? existing.isEnabled,
      updatedAt: new Date(),
    })
    .where(and(eq(appStoreEntries.id, entryId), eq(appStoreEntries.workspaceId, workspaceId)))
    .returning();
  return updated;
}

export async function remove(workspaceId: string, entryId: string, db: DbClient) {
  await getById(workspaceId, entryId, db);
  await db.delete(appStoreEntries)
    .where(and(eq(appStoreEntries.id, entryId), eq(appStoreEntries.workspaceId, workspaceId)));
}

// ── Seed data ──────────────────────────────────────────────────────

interface SeedEntry {
  name: string;
  description: string;
  category: string;
  icon: string;
  composeYaml: string;
  defaultEnv: Record<string, string>;
  memoryLimit: string;
  cpuLimit: string;
  version: string;
  author: string;
  homepage: string;
}

const seedData: SeedEntry[] = [
  // ── DevOps (3) ──────────────────────────────────────────────
  {
    name: "Nginx Proxy Manager",
    description: "Easy reverse proxy with SSL management. Expose your services with a few clicks.",
    category: "DevOps",
    icon: "globe",
    version: "latest",
    author: "jc21",
    homepage: "https://nginxproxymanager.com",
    memoryLimit: "256m",
    cpuLimit: "0.5",
    defaultEnv: { PORT_80: "8080", PORT_443: "8443", PORT_81: "8181" },
    composeYaml: `services:
  app:
    image: jc21/nginx-proxy-manager:latest
    container_name: "\${APP_NAME}"
    ports:
      - "\${PORT_80}:80"
      - "\${PORT_443}:443"
      - "\${PORT_81}:81"
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
    restart: unless-stopped`,
  },
  {
    name: "Portainer",
    description: "Powerful Docker container management UI. Manage containers, images, networks and volumes.",
    category: "DevOps",
    icon: "server",
    version: "CE",
    author: "Portainer",
    homepage: "https://www.portainer.io",
    memoryLimit: "256m",
    cpuLimit: "0.5",
    defaultEnv: { PORT: "9443" },
    composeYaml: `services:
  app:
    image: portainer/portainer-ce:latest
    container_name: "\${APP_NAME}"
    ports:
      - "\${PORT}:9443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/data
    restart: unless-stopped`,
  },
  {
    name: "Gitea",
    description: "Lightweight self-hosted Git service. A painless way to host your own Git repositories.",
    category: "DevOps",
    icon: "git-branch",
    version: "latest",
    author: "Gitea",
    homepage: "https://gitea.io",
    memoryLimit: "1g",
    cpuLimit: "1.0",
    defaultEnv: { SSH_PORT: "2222", WEB_PORT: "3000" },
    composeYaml: `services:
  app:
    image: gitea/gitea:latest
    container_name: "\${APP_NAME}"
    ports:
      - "\${WEB_PORT}:3000"
      - "\${SSH_PORT}:22"
    volumes:
      - ./data:/data
      - /etc/timezone:/etc/timezone:ro
      - /etc/localtime:/etc/localtime:ro
    restart: unless-stopped`,
  },

  // ── CMS (5) ──────────────────────────────────────────────────
  {
    name: "WordPress",
    description: "The world's most popular CMS. Build beautiful websites with blocks, themes and plugins.",
    category: "CMS",
    icon: "file-text",
    version: "latest",
    author: "WordPress",
    homepage: "https://wordpress.org",
    memoryLimit: "512m",
    cpuLimit: "1.0",
    defaultEnv: { PORT: "8080", DB_PASSWORD: "changeme", DB_ROOT_PASSWORD: "changeme" },
    composeYaml: `services:
  db:
    image: mysql:8
    container_name: "\${APP_NAME}-db"
    environment:
      MYSQL_DATABASE: wordpress
      MYSQL_USER: wordpress
      MYSQL_PASSWORD: "\${DB_PASSWORD}"
      MYSQL_ROOT_PASSWORD: "\${DB_ROOT_PASSWORD}"
    volumes:
      - ./db:/var/lib/mysql
    restart: unless-stopped
  app:
    image: wordpress:latest
    container_name: "\${APP_NAME}"
    ports:
      - "\${PORT}:80"
    environment:
      WORDPRESS_DB_HOST: db
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: "\${DB_PASSWORD}"
      WORDPRESS_DB_NAME: wordpress
    volumes:
      - ./html:/var/www/html
    depends_on:
      - db
    restart: unless-stopped`,
  },
  {
    name: "Nextcloud",
    description: "Self-hosted file sharing and collaboration platform. Your own private cloud.",
    category: "CMS",
    icon: "globe",
    version: "latest",
    author: "Nextcloud",
    homepage: "https://nextcloud.com",
    memoryLimit: "512m",
    cpuLimit: "1.0",
    defaultEnv: { PORT: "8080" },
    composeYaml: `services:
  app:
    image: nextcloud:latest
    container_name: "\${APP_NAME}"
    ports:
      - "\${PORT}:80"
    volumes:
      - ./html:/var/www/html
      - ./apps:/var/www/html/custom_apps
      - ./config:/var/www/html/config
      - ./data:/var/www/html/data
    restart: unless-stopped`,
  },
  {
    name: "Strapi",
    description: "Headless CMS with a powerful admin panel. Build APIs fast with customizable content types.",
    category: "CMS",
    icon: "file-text",
    version: "latest",
    author: "Strapi",
    homepage: "https://strapi.io",
    memoryLimit: "512m",
    cpuLimit: "1.0",
    defaultEnv: { PORT: "1337" },
    composeYaml: `services:
  app:
    image: strapi/strapi:latest
    container_name: "\${APP_NAME}"
    ports:
      - "\${PORT}:1337"
    volumes:
      - ./app:/srv/app
    environment:
      DATABASE_CLIENT: sqlite
      DATABASE_FILENAME: /srv/app/data.db
    restart: unless-stopped`,
  },
  {
    name: "Directus",
    description: "Open-source data platform. Wrap any SQL database with a beautiful API and admin panel.",
    category: "CMS",
    icon: "grid",
    version: "latest",
    author: "Directus",
    homepage: "https://directus.io",
    memoryLimit: "512m",
    cpuLimit: "1.0",
    defaultEnv: { PORT: "8055", ADMIN_EMAIL: "admin@example.com", ADMIN_PASSWORD: "changeme", KEY: "changeme", SECRET: "changeme" },
    composeYaml: `services:
  app:
    image: directus/directus:latest
    container_name: "\${APP_NAME}"
    ports:
      - "\${PORT}:8055"
    volumes:
      - ./uploads:/directus/uploads
      - ./database:/directus/database
    environment:
      ADMIN_EMAIL: "\${ADMIN_EMAIL}"
      ADMIN_PASSWORD: "\${ADMIN_PASSWORD}"
      KEY: "\${KEY}"
      SECRET: "\${SECRET}"
      DB_CLIENT: sqlite3
      DB_FILENAME: /directus/database/data.db
    restart: unless-stopped`,
  },
  {
    name: "Outline",
    description: "Beautiful wiki and knowledge base for your team. Real-time collaborative editing.",
    category: "CMS",
    icon: "pen-tool",
    version: "latest",
    author: "Outline",
    homepage: "https://www.getoutline.com",
    memoryLimit: "512m",
    cpuLimit: "1.0",
    defaultEnv: { PORT: "3000", SECRET_KEY: "changeme", UTILS_SECRET: "changeme", PG_PASSWORD: "changeme" },
    composeYaml: `services:
  db:
    image: postgres:15-alpine
    container_name: "\${APP_NAME}-db"
    environment:
      POSTGRES_DB: outline
      POSTGRES_USER: outline
      POSTGRES_PASSWORD: "\${PG_PASSWORD}"
    volumes:
      - ./db:/var/lib/postgresql/data
    restart: unless-stopped
  redis:
    image: redis:7-alpine
    container_name: "\${APP_NAME}-redis"
    restart: unless-stopped
  app:
    image: outlinewiki/outline:latest
    container_name: "\${APP_NAME}"
    ports:
      - "\${PORT}:3000"
    environment:
      DATABASE_URL: postgres://outline:\${PG_PASSWORD}@db:5432/outline
      REDIS_URL: redis://redis:6379
      SECRET_KEY: "\${SECRET_KEY}"
      UTILS_SECRET: "\${UTILS_SECRET}"
      URL: http://localhost:\${PORT}
    depends_on:
      - db
      - redis
    restart: unless-stopped`,
  },

  // ── Monitoring (4) ───────────────────────────────────────────
  {
    name: "Uptime Kuma",
    description: "Fancy self-hosted uptime monitoring. Monitor HTTP(s), TCP, Ping, DNS and more.",
    category: "Monitoring",
    icon: "activity",
    version: "latest",
    author: "Louis Lam",
    homepage: "https://uptime.kuma.pet",
    memoryLimit: "256m",
    cpuLimit: "0.5",
    defaultEnv: { PORT: "3001" },
    composeYaml: `services:
  app:
    image: louislam/uptime-kuma:latest
    container_name: "\${APP_NAME}"
    ports:
      - "\${PORT}:3001"
    volumes:
      - ./data:/app/data
    restart: unless-stopped`,
  },
  {
    name: "Plausible Analytics",
    description: "Privacy-friendly Google Analytics alternative. Lightweight, open-source web analytics.",
    category: "Monitoring",
    icon: "bar-chart",
    version: "latest",
    author: "Plausible",
    homepage: "https://plausible.io",
    memoryLimit: "1g",
    cpuLimit: "1.0",
    defaultEnv: { PORT: "8000", SECRET_KEY_BASE: "changeme" },
    composeYaml: `services:
  db:
    image: postgres:15-alpine
    container_name: "\${APP_NAME}-db"
    environment:
      POSTGRES_DB: plausible
      POSTGRES_USER: plausible
      POSTGRES_PASSWORD: "\${SECRET_KEY_BASE}"
    volumes:
      - ./db:/var/lib/postgresql/data
    restart: unless-stopped
  events:
    image: clickhouse/clickhouse-server:23-alpine
    container_name: "\${APP_NAME}-events"
    ulimits:
      nofile: 262144
    volumes:
      - ./clickhouse:/var/lib/clickhouse
    restart: unless-stopped
  app:
    image: plausible/analytics:latest
    container_name: "\${APP_NAME}"
    ports:
      - "\${PORT}:8000"
    environment:
      BASE_URL: http://localhost:\${PORT}
      SECRET_KEY_BASE: "\${SECRET_KEY_BASE}"
      DATABASE_URL: postgres://plausible:\${SECRET_KEY_BASE}@db:5432/plausible
      CLICKHOUSE_URL: http://events:8123/plausible
    depends_on:
      - db
      - events
    restart: unless-stopped`,
  },
  {
    name: "Grafana",
    description: "The open observability platform. Visualize metrics, logs, and traces from any source.",
    category: "Monitoring",
    icon: "activity",
    version: "latest",
    author: "Grafana Labs",
    homepage: "https://grafana.com",
    memoryLimit: "256m",
    cpuLimit: "0.5",
    defaultEnv: { PORT: "3000" },
    composeYaml: `services:
  app:
    image: grafana/grafana:latest
    container_name: "\${APP_NAME}"
    ports:
      - "\${PORT}:3000"
    volumes:
      - ./data:/var/lib/grafana
    restart: unless-stopped`,
  },
  {
    name: "Prometheus",
    description: "Powerful monitoring system and time series database. Collect and query metrics.",
    category: "Monitoring",
    icon: "bar-chart",
    version: "latest",
    author: "Prometheus",
    homepage: "https://prometheus.io",
    memoryLimit: "512m",
    cpuLimit: "1.0",
    defaultEnv: { PORT: "9090" },
    composeYaml: `services:
  app:
    image: prom/prometheus:latest
    container_name: "\${APP_NAME}"
    ports:
      - "\${PORT}:9090"
    volumes:
      - ./data:/prometheus
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    command:
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
    restart: unless-stopped`,
  },

  // ── Tools (4) ────────────────────────────────────────────────
  {
    name: "NocoDB",
    description: "Open-source Airtable alternative. Turns any database into a smart spreadsheet.",
    category: "Tools",
    icon: "grid",
    version: "latest",
    author: "NocoDB",
    homepage: "https://nocodb.com",
    memoryLimit: "512m",
    cpuLimit: "1.0",
    defaultEnv: { PORT: "8080" },
    composeYaml: `services:
  db:
    image: postgres:15-alpine
    container_name: "\${APP_NAME}-db"
    environment:
      POSTGRES_DB: nocodb
      POSTGRES_USER: nocodb
      POSTGRES_PASSWORD: changeme
    volumes:
      - ./db:/var/lib/postgresql/data
    restart: unless-stopped
  app:
    image: nocodb/nocodb:latest
    container_name: "\${APP_NAME}"
    ports:
      - "\${PORT}:8080"
    environment:
      NC_DB: pg://db:5432?u=nocodb&p=changeme&d=nocodb
    depends_on:
      - db
    restart: unless-stopped`,
  },
  {
    name: "Vaultwarden",
    description: "Unofficial Bitwarden server written in Rust. Lightweight password manager for teams.",
    category: "Tools",
    icon: "lock",
    version: "latest",
    author: "Vaultwarden",
    homepage: "https://github.com/dani-garcia/vaultwarden",
    memoryLimit: "256m",
    cpuLimit: "0.5",
    defaultEnv: { PORT: "8080" },
    composeYaml: `services:
  app:
    image: vaultwarden/server:latest
    container_name: "\${APP_NAME}"
    ports:
      - "\${PORT}:80"
    volumes:
      - ./data:/data
    restart: unless-stopped`,
  },
  {
    name: "Mattermost",
    description: "Open-source Slack alternative. Secure team messaging and collaboration platform.",
    category: "Tools",
    icon: "message-circle",
    version: "latest",
    author: "Mattermost",
    homepage: "https://mattermost.com",
    memoryLimit: "512m",
    cpuLimit: "1.0",
    defaultEnv: { PORT: "8065" },
    composeYaml: `services:
  app:
    image: mattermost/mattermost-team-edition:latest
    container_name: "\${APP_NAME}"
    ports:
      - "\${PORT}:8065"
    volumes:
      - ./data:/mattermost/data
      - ./config:/mattermost/config
      - ./logs:/mattermost/logs
      - ./plugins:/mattermost/plugins
    restart: unless-stopped`,
  },
  {
    name: "Node-RED",
    description: "Flow-based programming for IoT. Wire together devices, APIs and services visually.",
    category: "Tools",
    icon: "cpu",
    version: "latest",
    author: "OpenJS Foundation",
    homepage: "https://nodered.org",
    memoryLimit: "256m",
    cpuLimit: "0.5",
    defaultEnv: { PORT: "1880" },
    composeYaml: `services:
  app:
    image: nodered/node-red:latest
    container_name: "\${APP_NAME}"
    ports:
      - "\${PORT}:1880"
    volumes:
      - ./data:/data
    restart: unless-stopped`,
  },

  // ── AI/IoT (1) ───────────────────────────────────────────────
  {
    name: "Home Assistant",
    description: "Open-source home automation platform. Control lights, climate, media, and more.",
    category: "AI",
    icon: "home",
    version: "latest",
    author: "Home Assistant",
    homepage: "https://www.home-assistant.io",
    memoryLimit: "1g",
    cpuLimit: "1.0",
    defaultEnv: { PORT: "8123" },
    composeYaml: `services:
  app:
    image: homeassistant/home-assistant:latest
    container_name: "\${APP_NAME}"
    ports:
      - "\${PORT}:8123"
    volumes:
      - ./config:/config
      - /etc/localtime:/etc/localtime:ro
    restart: unless-stopped`,
  },

  // ── Utility (1) ──────────────────────────────────────────────
  {
    name: "Changedetection",
    description: "Monitor web pages for changes. Get notified when content updates.",
    category: "Monitoring",
    icon: "refresh-cw",
    version: "latest",
    author: "Changedetection",
    homepage: "https://changedetection.io",
    memoryLimit: "256m",
    cpuLimit: "0.3",
    defaultEnv: { PORT: "5000" },
    composeYaml: `services:
  app:
    image: ghcr.io/dgtlmoon/changedetection.io:latest
    container_name: "\${APP_NAME}"
    ports:
      - "\${PORT}:5000"
    volumes:
      - ./data:/datastore
    restart: unless-stopped`,
  },
];

export async function seed(workspaceId: string, db: DbClient) {
  const existing = await db.select({ id: appStoreEntries.id })
    .from(appStoreEntries)
    .where(eq(appStoreEntries.workspaceId, workspaceId))
    .limit(1);
  if (existing.length > 0) return { seeded: false, message: "App store already has entries" };

  let count = 0;
  for (const entry of seedData) {
    try {
      await db.insert(appStoreEntries).values({
        workspaceId,
        name: entry.name,
        description: entry.description,
        category: entry.category,
        icon: entry.icon,
        composeYaml: entry.composeYaml,
        defaultEnv: entry.defaultEnv,
        memoryLimit: entry.memoryLimit,
        cpuLimit: entry.cpuLimit,
        version: entry.version,
        author: entry.author,
        homepage: entry.homepage,
        isEnabled: true,
      } as any);
      count++;
    } catch (err: any) {
      throw new Error(`Seed failed on "${entry.name}": ${err.message}`);
    }
  }
  return { seeded: true, count };
}
