FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:20-alpine
ENV NODE_ENV=production PORT=4000
WORKDIR /app
RUN addgroup -S wonderlearn && adduser -S wonderlearn -G wonderlearn
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=wonderlearn:wonderlearn . .
USER wonderlearn
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD wget -qO- http://127.0.0.1:4000/api/health || exit 1
CMD ["node","src/index.js"]
