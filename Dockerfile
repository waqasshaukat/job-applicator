FROM mcr.microsoft.com/playwright:v1.49.1-jammy

WORKDIR /app

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "dist/worker-server.js"]
