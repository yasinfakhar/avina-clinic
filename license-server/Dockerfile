FROM node:22-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
RUN mkdir -p /data && chown -R node:node /app /data
USER node
EXPOSE 8787
VOLUME ["/data"]
CMD ["node", "src/server.mjs"]
