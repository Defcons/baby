# Self-hosted baby suite: static pages + worker APIs in one small Node process.
# Data lives in the /data volume (host: /apps/baby-data), never in the image.
FROM node:22-alpine
WORKDIR /app
COPY . .
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
USER node
EXPOSE 8080
CMD ["node", "server/server.js"]
