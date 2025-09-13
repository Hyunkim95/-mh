# Build stage
FROM node:18-alpine AS builder

# Install build dependencies for native modules
RUN apk add --no-cache python3 make g++ eudev-dev libusb-dev linux-headers

# Set working directory
WORKDIR /app

# Copy package files for dependency resolution
COPY package.json yarn.lock .yarnrc.yml ./
COPY apps/api/package.json ./apps/api/
COPY libs/client/package.json ./libs/client/
COPY libs/server/package.json ./libs/server/
COPY libs/shared/package.json ./libs/shared/
COPY libs/crypto-utils/package.json ./libs/crypto-utils/
COPY libs/etl/package.json ./libs/etl/
COPY libs/solana-client/package.json ./libs/solana-client/
COPY libs/solana-node/package.json ./libs/solana-node/

# Enable Corepack and install dependencies
RUN corepack enable
RUN yarn install

# Dependencies are now added to individual packages where needed

# Copy source code
COPY . .

# Build the libraries in dependency order
RUN cd libs/etl && yarn build
RUN cd libs/crypto-utils && yarn build
RUN cd libs/solana-node && yarn build
RUN cd libs/server && yarn build
RUN cd libs/shared && yarn build

# Build the API (needs to be done from root to resolve workspace dependencies)
RUN yarn workspace @trpc-template/api build

# Production stage
FROM node:18-alpine AS production

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json yarn.lock .yarnrc.yml ./
COPY apps/api/package.json ./apps/api/
COPY libs/client/package.json ./libs/client/
COPY libs/server/package.json ./libs/server/
COPY libs/shared/package.json ./libs/shared/
COPY libs/crypto-utils/package.json ./libs/crypto-utils/
COPY libs/etl/package.json ./libs/etl/
COPY libs/solana-client/package.json ./libs/solana-client/
COPY libs/solana-node/package.json ./libs/solana-node/

# Enable Corepack and install only production dependencies
RUN corepack enable
RUN yarn workspaces focus --production

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
EXPOSE $PORT

# Start the application
CMD ["node", "apps/api/dist/index.js"] 