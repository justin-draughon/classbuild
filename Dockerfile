# Stage 1: Build the SPA
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Node server serving static files + API proxy
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY server.mjs ./
COPY --from=builder /app/dist ./dist
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "server.mjs"]
