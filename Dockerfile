FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /app/.data
EXPOSE 4317
VOLUME ["/app/.data"]
CMD ["node", "server.mjs"]
