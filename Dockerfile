# Use Node.js 22 base image
FROM node:22-slim

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Cache buster - force rebuild
ARG CACHEBUST=1
RUN echo "Cache bust: $CACHEBUST"

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy application code
COPY . .

# Expose port
EXPOSE 3000

# Start command (will run db:push first, then start server)
CMD ["pnpm", "run", "railway:start"]
