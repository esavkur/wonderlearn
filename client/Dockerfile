FROM node:20-alpine AS build
RUN apk update && apk upgrade
WORKDIR /app

COPY package*.json ./
COPY scripts ./scripts

RUN npm ci

COPY . .
RUN mkdir -p public \
    && cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs \
          public/pdf.worker.min.mjs
          
ARG GIT_SHA=local
ENV VITE_APP_VERSION=$GIT_SHA

RUN npm run build

FROM nginx:1.27-alpine

RUN apk update && apk upgrade --no-cache

RUN rm -f /etc/nginx/conf.d/default.conf \
    && mkdir -p \
       /var/cache/nginx \
       /var/log/nginx \
       /usr/share/nginx/html \
       /tmp/nginx \
    && sed -i 's#pid[[:space:]]*/run/nginx.pid;#pid /tmp/nginx.pid;#' /etc/nginx/nginx.conf \
    && chown -R nginx:nginx \
       /var/cache/nginx \
       /var/log/nginx \
       /usr/share/nginx/html \
       /tmp/nginx \
       /etc/nginx

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.d/40-runtime-config.sh
COPY --from=build /app/dist /usr/share/nginx/html

RUN chmod 755 /docker-entrypoint.d/40-runtime-config.sh \
    && chown -R nginx:nginx \
       /docker-entrypoint.d/40-runtime-config.sh \
       /usr/share/nginx/html

USER nginx

EXPOSE 8080