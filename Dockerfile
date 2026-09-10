FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY server.js init-admin.js init-data.js ecosystem.config.js ./
COPY public ./public
COPY admin ./admin
COPY data-init ./data-init

RUN mkdir -p data uploads tmp-uploads logs && \
    addgroup -S appgroup && \
    adduser -S appuser -G appgroup && \
    chown -R appuser:appgroup /app

VOLUME ["/app/data", "/app/uploads"]

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

USER appuser

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/categories || exit 1

CMD ["node", "server.js"]
