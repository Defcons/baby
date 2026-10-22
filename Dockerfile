# Self-hosted baby suite: static pages + worker APIs in one small Node process.
# Data lives in the /data volume (host path in docker-compose.yml), never in the image.
FROM node:22-alpine
WORKDIR /app
COPY . .
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
# The server runs as its own user, uid 10001 (docker-compose.yml sets the same), never root. Compose's init step gives
# it /data at every start; the code in /app stays root's and read-only.
USER 10001:10001
EXPOSE 8080
CMD ["node", "server/server.js"]
