#!/usr/bin/env bash
set -Eeuo pipefail
trap 'echo "ERROR: command failed at line $LINENO" >&2' ERR

required_vars=(
  UNIQUE_SUFFIX
  MONGODB_DEV_URI
  MONGODB_PROD_URI
  OPENAI_API_KEY
  JWT_DEV_SECRET
  JWT_PROD_SECRET
)

for var in "${required_vars[@]}"; do
  if [[ -z "${!var:-}" ]]; then
    echo "ERROR: required environment variable $var is not set." >&2
    exit 1
  fi
done

az account show --query '{Subscription:name,User:user.name}' -o table

SIGNED_IN_OBJECT_ID="$(az ad signed-in-user show --query id -o tsv)"

retry() {
  local attempts="$1"
  local delay="$2"
  shift 2

  local count=1
  until "$@"; do
    if (( count >= attempts )); then
      echo "ERROR: command still failing after ${attempts} attempts: $*" >&2
      return 1
    fi
    echo "Waiting for Azure RBAC/ARM propagation (${count}/${attempts})..."
    sleep "$delay"
    ((count++))
  done
}

ensure_role_assignment() {
  local principal_id="$1"
  local principal_type="$2"
  local role_name="$3"
  local scope="$4"

  if az role assignment list \
      --assignee-object-id "$principal_id" \
      --scope "$scope" \
      --query "[?roleDefinitionName=='${role_name}'] | length(@)" \
      -o tsv 2>/dev/null | grep -qE '^[1-9]'; then
    echo "Role already assigned: ${role_name}"
  else
    echo "Assigning role: ${role_name}"
    retry 12 10 az role assignment create \
      --assignee-object-id "$principal_id" \
      --assignee-principal-type "$principal_type" \
      --role "$role_name" \
      --scope "$scope" \
      --output none
  fi
}

set_secret_with_retry() {
  local vault_name="$1"
  local secret_name="$2"
  local secret_value="$3"

  retry 18 10 az keyvault secret set \
    --vault-name "$vault_name" \
    --name "$secret_name" \
    --value "$secret_value" \
    --output none
}

configure_environment() {
  local env_name="$1"
  local rg="rg-wonderlearn-${env_name}"
  local kv
  local frontend="app-wonderlearn-frontend-${env_name}-${UNIQUE_SUFFIX}"
  local api="app-wonderlearn-api-${env_name}-${UNIQUE_SUFFIX}"
  local storage="stwonderlearn${env_name}${UNIQUE_SUFFIX}"
  local app_insights="appi-wonderlearn-${env_name}"
  local mongo_uri
  local jwt_secret

  if [[ "$env_name" == "dev" ]]; then
    kv="kvwldev${UNIQUE_SUFFIX}"
    mongo_uri="$MONGODB_DEV_URI"
    jwt_secret="$JWT_DEV_SECRET"
  else
    kv="kvwlprod${UNIQUE_SUFFIX}"
    mongo_uri="$MONGODB_PROD_URI"
    jwt_secret="$JWT_PROD_SECRET"
  fi

  echo
  echo "Configuring ${env_name}..."

  local kv_id storage_id api_principal_id ai_connection
  kv_id="$(az keyvault show -g "$rg" -n "$kv" --query id -o tsv)"
  storage_id="$(az storage account show -g "$rg" -n "$storage" --query id -o tsv)"

  ensure_role_assignment \
    "$SIGNED_IN_OBJECT_ID" \
    "User" \
    "Key Vault Administrator" \
    "$kv_id"

  echo "Writing secrets to ${kv}..."
  set_secret_with_retry "$kv" "OpenAIApiKey" "$OPENAI_API_KEY"
  set_secret_with_retry "$kv" "MongoDbUri" "$mongo_uri"
  set_secret_with_retry "$kv" "JwtSecret" "$jwt_secret"

  echo "Enabling system-assigned identity on ${api}..."
  api_principal_id="$(retry 12 10 az webapp identity assign \
    -g "$rg" \
    -n "$api" \
    --query principalId \
    -o tsv)"

  if [[ -z "$api_principal_id" ]]; then
    api_principal_id="$(az webapp identity show -g "$rg" -n "$api" --query principalId -o tsv)"
  fi

  ensure_role_assignment \
    "$api_principal_id" \
    "ServicePrincipal" \
    "Key Vault Secrets User" \
    "$kv_id"

  ensure_role_assignment \
    "$api_principal_id" \
    "ServicePrincipal" \
    "Storage Blob Data Reader" \
    "$storage_id"

  ai_connection="$(az monitor app-insights component show \
    -g "$rg" \
    -a "$app_insights" \
    --query connectionString \
    -o tsv)"

  echo "Configuring frontend settings..."
  az webapp config appsettings set \
    -g "$rg" \
    -n "$frontend" \
    --settings \
      WEBSITES_PORT=8080 \
      API_BASE_URL="https://${api}.azurewebsites.net/api" \
    --output none

  echo "Configuring backend settings and Key Vault references..."
  az webapp config appsettings set \
    -g "$rg" \
    -n "$api" \
    --settings \
      WEBSITES_PORT=4000 \
      PORT=4000 \
      NODE_ENV=production \
      APP_VERSION=bootstrap \
      CLIENT_ORIGIN="https://${frontend}.azurewebsites.net" \
      BOOK_STORAGE_ACCOUNT="$storage" \
      BOOK_CONTAINER_NAME=books \
      APPLICATIONINSIGHTS_CONNECTION_STRING="$ai_connection" \
      MONGODB_URI="@Microsoft.KeyVault(SecretUri=https://${kv}.vault.azure.net/secrets/MongoDbUri/)" \
      JWT_SECRET="@Microsoft.KeyVault(SecretUri=https://${kv}.vault.azure.net/secrets/JwtSecret/)" \
      OPENAI_API_KEY="@Microsoft.KeyVault(SecretUri=https://${kv}.vault.azure.net/secrets/OpenAIApiKey/)" \
    --output none

  # Replace wildcard/default CORS with the matching frontend only.
  az webapp cors remove \
    -g "$rg" \
    -n "$api" \
    --allowed-origins '*' \
    --output none 2>/dev/null || true

  az webapp cors add \
    -g "$rg" \
    -n "$api" \
    --allowed-origins "https://${frontend}.azurewebsites.net" \
    --output none

  # Force App Service to re-resolve Key Vault references after role propagation.
  az webapp restart -g "$rg" -n "$api" --output none
  az webapp restart -g "$rg" -n "$frontend" --output none

  echo "${env_name} configuration completed:"
  echo "  Frontend: https://${frontend}.azurewebsites.net"
  echo "  Backend:  https://${api}.azurewebsites.net"
  echo "  KeyVault: ${kv}"
}

configure_environment dev
configure_environment prod

echo
echo "Secrets, managed identities, RBAC roles, CORS, and App Service settings configured successfully."
echo "No YouTube API secret or setting was created."