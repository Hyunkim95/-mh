# 🐳 Docker Setup Guide

This project includes Docker configuration for running the full stack (Web, API, and PostgreSQL) in containers.

## 📋 Prerequisites

- Docker
- Docker Compose

## 🚀 Quick Start

### Development Environment

```bash
# Start development environment with hot reload
yarn docker:dev

# Or using docker-compose directly
docker-compose -f docker-compose.dev.yml up --build
```

**Development URLs:**
- 📱 **Web App**: http://localhost:5173
- 🚀 **API**: http://localhost:3001
- 🐘 **PostgreSQL**: localhost:5433

### Production Environment

```bash
# Start production environment
yarn docker:prod

# Or using docker-compose directly
docker-compose up --build
```

**Production URLs:**
- 📱 **Web App**: http://localhost
- 🚀 **API**: http://localhost:3001
- 🐘 **PostgreSQL**: localhost:5432

## 📊 Management Commands

```bash
# View logs
yarn docker:logs        # Production logs
yarn docker:logs:dev    # Development logs

# Stop all containers
yarn docker:down

# View running containers
docker-compose ps
docker-compose -f docker-compose.dev.yml ps
```

## 🗂️ Docker Files Structure

```
├── docker-compose.yml          # Production configuration
├── docker-compose.dev.yml      # Development configuration
├── apps/
│   ├── web/
│   │   ├── Dockerfile          # Production web build
│   │   ├── Dockerfile.dev      # Development web build
│   │   └── nginx.conf          # Nginx configuration
│   └── api/
│       ├── Dockerfile          # Production API build
│       └── Dockerfile.dev      # Development API build
├── init-db/
│   └── 01-init.sql            # Database initialization
├── scripts/
│   ├── docker-dev.sh          # Development setup script
│   └── docker-prod.sh         # Production setup script
└── .dockerignore              # Docker ignore patterns
```

## 🔧 Configuration

### Environment Variables

Copy `env.example` to `.env` and customize:

```bash
# Database Configuration
DATABASE_URL=postgresql://trpc_user:trpc_password@localhost:5432/trpc_db

# API Configuration
PORT=3001
HOST=0.0.0.0
NODE_ENV=development

# Web Configuration
VITE_API_URL=http://localhost:3001

# Docker PostgreSQL Configuration
POSTGRES_DB=trpc_db
POSTGRES_USER=trpc_user
POSTGRES_PASSWORD=trpc_password
```

### Database

The PostgreSQL container includes:
- **Database**: `trpc_db` / `trpc_dev`
- **User**: `trpc_user`
- **Password**: `trpc_password`
- **Initialization**: Scripts in `init-db/` run on first startup

### Volumes

- **postgres_data**: Production database data
- **postgres_dev_data**: Development database data

## 🛠️ Development Features

### Hot Reload
Development containers include hot reload for both web and API:
- Web: Vite dev server with HMR
- API: tsx watch mode for TypeScript

### Volume Mounts
Development containers mount source code for real-time changes:
```yaml
volumes:
  - .:/app
  - /app/node_modules  # Exclude node_modules
```

## 🏗️ Build Process

### Web (Production)
1. Multi-stage build with Node.js
2. Build shared libraries (client, shared)
3. Build React app with Vite
4. Serve with Nginx

### API (Production)
1. Multi-stage build with Node.js
2. Build shared libraries (server, shared)
3. Build API with tsx
4. Run with Node.js (non-root user)

## 🔍 Troubleshooting

### Port Conflicts
If ports are already in use:
- Development: Change ports in `docker-compose.dev.yml`
- Production: Change ports in `docker-compose.yml`

### Database Connection Issues
```bash
# Check database health
docker-compose exec postgres pg_isready -U trpc_user -d trpc_db

# View database logs
docker-compose logs postgres
```

### Build Issues
```bash
# Clean build (remove volumes and rebuild)
docker-compose down -v
docker-compose up --build

# Remove all containers and images
docker system prune -a
```

## 📈 Health Checks

All services include health checks:
- **PostgreSQL**: `pg_isready` command
- **API**: HTTP request to tRPC endpoint
- **Web**: HTTP request to root path

## 🔐 Security Notes

- Production containers run as non-root users
- Environment variables should be properly secured
- Database credentials should be changed for production use
- Consider using Docker secrets for sensitive data

## 🚀 Deployment

For production deployment:
1. Update environment variables
2. Configure proper database credentials
3. Set up reverse proxy (if needed)
4. Configure SSL certificates
5. Set up monitoring and logging
