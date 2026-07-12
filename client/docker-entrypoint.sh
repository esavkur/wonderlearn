#!/bin/sh
set -eu
API_BASE_URL="${API_BASE_URL:-/api}"
sed "s|\${API_BASE_URL}|${API_BASE_URL}|g" /usr/share/nginx/html/config.template.js > /usr/share/nginx/html/config.js
exec "$@"
