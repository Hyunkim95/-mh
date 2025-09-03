# Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/
COPY libs/client/package.json ./libs/client/
COPY libs/server/package.json ./libs/server/
COPY libs/shared/package.json ./libs/shared/

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy source code
COPY . .

# Build the shared libraries first
RUN yarn build:server && yarn build:shared

# Build the API
RUN cd apps/api && yarn build

# Production stage
FROM node:18-alpine AS production

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/
COPY libs/client/package.json ./libs/client/
COPY libs/server/package.json ./libs/server/
COPY libs/shared/package.json ./libs/shared/

# Install only production dependencies
RUN yarn install --frozen-lockfile --production

# Copy built application
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/libs/server/dist ./libs/server/dist
COPY --from=builder /app/libs/shared/dist ./libs/shared/dist

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Change ownership
RUN chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 3001

# Start the application
CMD ["node", "apps/api/dist/index.js"]
