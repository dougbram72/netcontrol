# --- Build frontend ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig.json tsconfig.app.json tsconfig.node.json ./
COPY public ./public
COPY src ./src
COPY server ./server
RUN npm run build:client

# --- Runtime ---
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV FCC_DATA_DIR=/data/fcc

RUN apk add --no-cache unzip

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY --from=build /app/dist ./dist

RUN mkdir -p /data/fcc

EXPOSE 3000
VOLUME ["/data/fcc"]
CMD ["npx", "tsx", "server/src/index.ts"]
