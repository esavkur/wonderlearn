#!/usr/bin/env bash
set -euo pipefail
: "${RESOURCE_GROUP:?}" "${ACR_NAME:?}" "${FRONTEND_APP:?}" "${BACKEND_APP:?}" "${FRONTEND_TAG:?}" "${BACKEND_TAG:?}"
LOGIN_SERVER=$(az acr show -g "$RESOURCE_GROUP" -n "$ACR_NAME" --query loginServer -o tsv 2>/dev/null || az acr show -n "$ACR_NAME" --query loginServer -o tsv)
az webapp config container set -g "$RESOURCE_GROUP" -n "$FRONTEND_APP" --container-image-name "$LOGIN_SERVER/wonderlearn-frontend:$FRONTEND_TAG" --container-registry-url "https://$LOGIN_SERVER"
az webapp config container set -g "$RESOURCE_GROUP" -n "$BACKEND_APP" --container-image-name "$LOGIN_SERVER/wonderlearn-backend:$BACKEND_TAG" --container-registry-url "https://$LOGIN_SERVER"
az webapp restart -g "$RESOURCE_GROUP" -n "$FRONTEND_APP"; az webapp restart -g "$RESOURCE_GROUP" -n "$BACKEND_APP"
