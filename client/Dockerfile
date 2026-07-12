FROM node:20-alpine AS build
RUN apk update && apk upgrade
WORKDIR /app

COPY package*.json ./
COPY scripts ./scripts

RUN npm ci

COPY . .

ARG GIT_SHA=local
ENV VITE_APP_VERSION=$GIT_SHA

RUN npm run build

FROM nginx:1.27-alpine

RUN apk update && apk upgrade --no-cache

RUN rm -f /etc/nginx/conf.d/default.conf \
    && mkdir -p /var/cache/nginx /var/run /usr/share/nginx/html \
    && chown -R nginx:nginx \
       /var/cache/nginx \
       /var/run \
       /usr/share/nginx/html \
       /etc/nginx

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.d/40-runtime-config.sh
COPY --from=build /app/dist /usr/share/nginx/html

RUN chmod +x /docker-entrypoint.d/40-runtime-config.sh \
    && chown -R nginx:nginx /usr/share/nginx/html

USER nginx

EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1:8080/health || exit 1
