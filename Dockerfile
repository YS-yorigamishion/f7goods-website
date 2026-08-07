FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

RUN mkdir -p data uploads logs && \
    addgroup -S appgroup && \
    adduser -S appuser -G appgroup && \
    chown -R appuser:appgroup /app

VOLUME ["/app/data", "/app/uploads"]

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

USER appuser

CMD ["node", "server.js"]
