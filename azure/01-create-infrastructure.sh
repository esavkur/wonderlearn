#!/usr/bin/env bash
set -Eeuo pipefail

# WonderLearn Azure infrastructure bootstrap (no Terraform)
# Creates one shared Linux B1 App Service Plan for all Dev/Prod Web Apps.
# This uses only one App Service worker, which is friendlier to free/trial quotas.

trap 'echo "ERROR: command failed at line $LINENO" >&2' ERR

: "${AZURE_SUBSCRIPTION_ID:?Set AZURE_SUBSCRIPTION_ID first}"
: "${UNIQUE_SUFFIX:?Set UNIQUE_SUFFIX using lowercase letters/numbers, e.g. sk85wl2}"

if [[ ! "$UNIQUE_SUFFIX" =~ ^[a-z0-9]+$ ]]; then
  echo "UNIQUE_SUFFIX must contain lowercase letters and numbers only." >&2
  exit 1
fi

az account set --subscription "$AZURE_SUBSCRIPTION_ID"
az account show --query '{subscription:name,id:id,user:user.name}' -o table

SHARED_RG="rg-wonderlearn-shared"
DEV_RG="rg-wonderlearn-dev"
PROD_RG="rg-wonderlearn-prod"

ACR_NAME="acrwonderlearn${UNIQUE_SUFFIX}"
SHARED_PLAN="asp-wonderlearn-shared"

# Azure naming limits
DEV_STORAGE="stwonderlearndev${UNIQUE_SUFFIX}"
PROD_STORAGE="stwonderlearnprod${UNIQUE_SUFFIX}"
DEV_KV="kvwldev${UNIQUE_SUFFIX}"
PROD_KV="kvwlprod${UNIQUE_SUFFIX}"
DEV_FRONTEND="app-wonderlearn-frontend-dev-${UNIQUE_SUFFIX}"
DEV_API="app-wonderlearn-api-dev-${UNIQUE_SUFFIX}"
PROD_FRONTEND="app-wonderlearn-frontend-prod-${UNIQUE_SUFFIX}"
PROD_API="app-wonderlearn-api-prod-${UNIQUE_SUFFIX}"

for storage_name in "$DEV_STORAGE" "$PROD_STORAGE"; do
  if (( ${#storage_name} > 24 )); then
    echo "Storage account name '$storage_name' exceeds Azure's 24-character limit." >&2
    echo "Use a shorter UNIQUE_SUFFIX." >&2
    exit 1
  fi
done


for kv_name in "$DEV_KV" "$PROD_KV"; do
  if (( ${#kv_name} > 24 )); then
    echo "Key Vault name '$kv_name' exceeds Azure's 24-character limit." >&2
    echo "Use a shorter UNIQUE_SUFFIX." >&2
    exit 1
  fi
done

if (( ${#ACR_NAME} > 50 )); then
  echo "ACR name exceeds Azure's 50-character limit." >&2
  exit 1
fi

# Try an explicitly requested LOCATION first, then automatically fall back.
# Azure CLI may return display names such as "UK South" from list-locations,
# so we do not pre-filter canonical region codes; the real B1 plan probe is authoritative.
DEFAULT_LOCATIONS=(
  "uksouth"
  "ukwest"
  "northeurope"
  "swedencentral"
  "westeurope"
  "francecentral"
  "germanywestcentral"
  "norwayeast"
  "switzerlandnorth"
  "australiaeast"
  "southeastasia"
  "japaneast"
)

CANDIDATE_LOCATIONS=()
if [[ -n "${LOCATION:-}" ]]; then
  CANDIDATE_LOCATIONS+=("$LOCATION")
fi
for region in "${DEFAULT_LOCATIONS[@]}"; do
  [[ " ${CANDIDATE_LOCATIONS[*]} " == *" $region "* ]] || CANDIDATE_LOCATIONS+=("$region")
done

probe_b1_quota() {
  local location="$1"
  local probe_id="$(date +%s)-$RANDOM"
  local probe_rg="rg-wl-probe-${UNIQUE_SUFFIX}-${probe_id}"
  local probe_plan="asp-wl-probe-${UNIQUE_SUFFIX}-${RANDOM}"

  echo "Testing Linux B1 App Service quota in: $location"
  az group create -n "$probe_rg" -l "$location" --output none

  if az appservice plan create \
      -g "$probe_rg" \
      -n "$probe_plan" \
      --location "$location" \
      --is-linux \
      --sku B1 \
      --number-of-workers 1 \
      --output none 2>/tmp/wonderlearn-plan-probe.err; then
    az group delete -n "$probe_rg" --yes --no-wait >/dev/null 2>&1 || true
    return 0
  fi

  echo "B1 quota unavailable in $location:"
  sed -n '1,8p' /tmp/wonderlearn-plan-probe.err || true
  az group delete -n "$probe_rg" --yes --no-wait >/dev/null 2>&1 || true
  return 1
}

SELECTED_LOCATION=""
for candidate in "${CANDIDATE_LOCATIONS[@]}"; do
  if probe_b1_quota "$candidate"; then
    SELECTED_LOCATION="$candidate"
    break
  fi
done

if [[ -z "$SELECTED_LOCATION" ]]; then
  echo
  echo "No tested region allowed a Linux B1 App Service worker in this subscription." >&2
  echo "Check quota in Azure Portal, or rerun with another region:" >&2
  echo "  export LOCATION='ukwest'" >&2
  echo "  ./azure/01-create-infrastructure.sh" >&2
  exit 1
fi

LOCATION="$SELECTED_LOCATION"
echo "$LOCATION" > "$(dirname "$0")/.selected-location"
echo "Selected Azure region: $LOCATION"

# Placeholder images used only until Jenkins deploys the real images.
FRONTEND_PLACEHOLDER="mcr.microsoft.com/azuredocs/aci-helloworld:latest"
BACKEND_PLACEHOLDER="mcr.microsoft.com/azuredocs/aci-helloworld:latest"

create_rg() {
  az group create -n "$1" -l "$LOCATION" --tags project=WonderLearn environment="$2" managed-by=azure-cli --output none
}

ensure_key_vault() {
  local rg="$1"
  local kv="$2"

  if az keyvault show -g "$rg" -n "$kv" --output none 2>/dev/null; then
    echo "Key Vault $kv already exists. Reusing it."
  else
    echo "Creating Key Vault: $kv"
    az keyvault create \
      -g "$rg" -n "$kv" -l "$LOCATION" \
      --enable-rbac-authorization true \
      --retention-days 7 \
      --output none
  fi
}

ensure_webapp() {
  local rg="$1"
  local app="$2"
  local plan_id="$3"
  local image="$4"

  if az webapp show -g "$rg" -n "$app" --output none 2>/dev/null; then
    echo "Web App $app already exists. Reusing it."
  else
    echo "Creating Web App: $app"
    az webapp create \
      -g "$rg" \
      -p "$plan_id" \
      -n "$app" \
      --deployment-container-image-name "$image" \
      --output none
  fi
}

create_environment() {
  local env="$1"
  local rg storage kv law appi frontend api client_origin

  if [[ "$env" == "dev" ]]; then
    rg="$DEV_RG"
    storage="$DEV_STORAGE"
    kv="$DEV_KV"
    law="log-wonderlearn-dev"
    appi="appi-wonderlearn-dev"
    frontend="$DEV_FRONTEND"
    api="$DEV_API"
  else
    rg="$PROD_RG"
    storage="$PROD_STORAGE"
    kv="$PROD_KV"
    law="log-wonderlearn-prod"
    appi="appi-wonderlearn-prod"
    frontend="$PROD_FRONTEND"
    api="$PROD_API"
  fi

  echo "Creating $env resources in $LOCATION..."
  create_rg "$rg" "$env"

  az monitor log-analytics workspace create \
    -g "$rg" -n "$law" -l "$LOCATION" \
    --retention-time 30 --output none

  az monitor app-insights component create \
    -g "$rg" -a "$appi" -l "$LOCATION" \
    --workspace "$law" --application-type web --output none

  az storage account create \
    -g "$rg" -n "$storage" -l "$LOCATION" \
    --sku Standard_LRS \
    --kind StorageV2 \
    --min-tls-version TLS1_2 \
    --https-only true \
    --allow-blob-public-access false \
    --output none

  local storage_key
  storage_key=$(az storage account keys list -g "$rg" -n "$storage" --query '[0].value' -o tsv)
  az storage container create \
    --account-name "$storage" \
    --account-key "$storage_key" \
    --name books \
    --public-access off \
    --output none

  ensure_key_vault "$rg" "$kv"

  # Give the currently signed-in Azure CLI user permission BEFORE secret insertion.
  local signed_in_object_id kv_id
  signed_in_object_id=$(az ad signed-in-user show --query id -o tsv)
  kv_id=$(az keyvault show -g "$rg" -n "$kv" --query id -o tsv)

  az role assignment create \
    --assignee-object-id "$signed_in_object_id" \
    --assignee-principal-type User \
    --role "Key Vault Administrator" \
    --scope "$kv_id" \
    --output none 2>/dev/null || true

  ensure_webapp "$rg" "$frontend" "$SHARED_PLAN_ID" "$FRONTEND_PLACEHOLDER"
  ensure_webapp "$rg" "$api" "$SHARED_PLAN_ID" "$BACKEND_PLACEHOLDER"

  az webapp identity assign -g "$rg" -n "$api" --output none

  az webapp update -g "$rg" -n "$frontend" --https-only true --output none
  az webapp update -g "$rg" -n "$api" --https-only true --output none

  az webapp config set \
    -g "$rg" -n "$frontend" \
    --min-tls-version 1.2 \
    --ftps-state Disabled \
    --always-on true \
    --http20-enabled true \
    --output none

  az webapp config set \
    -g "$rg" -n "$api" \
    --min-tls-version 1.2 \
    --ftps-state Disabled \
    --always-on true \
    --http20-enabled true \
    --generic-configurations '{"healthCheckPath":"/api/health"}' \
    --output none

  local principal_id storage_id
  principal_id=$(az webapp identity show -g "$rg" -n "$api" --query principalId -o tsv)
  storage_id=$(az storage account show -g "$rg" -n "$storage" --query id -o tsv)

  az role assignment create \
    --assignee-object-id "$principal_id" \
    --assignee-principal-type ServicePrincipal \
    --role "Key Vault Secrets User" \
    --scope "$kv_id" \
    --output none 2>/dev/null || true

  az role assignment create \
    --assignee-object-id "$principal_id" \
    --assignee-principal-type ServicePrincipal \
    --role "Storage Blob Data Reader" \
    --scope "$storage_id" \
    --output none 2>/dev/null || true

  local appi_connection
  appi_connection=$(az monitor app-insights component show -g "$rg" -a "$appi" --query connectionString -o tsv)
  client_origin="https://${frontend}.azurewebsites.net"

  # Non-secret settings only. Secret Key Vault references are configured by 02-set-secrets-and-config.sh.
  az webapp config appsettings set -g "$rg" -n "$api" --settings \
    NODE_ENV="$env" \
    PORT=8080 \
    WEBSITES_PORT=8080 \
    WEBSITES_ENABLE_APP_SERVICE_STORAGE=false \
    CLIENT_ORIGIN="$client_origin" \
    APPLICATIONINSIGHTS_CONNECTION_STRING="$appi_connection" \
    BOOK_STORAGE_ACCOUNT="$storage" \
    BOOK_CONTAINER_NAME=books \
    APP_VERSION=bootstrap \
    --output none

  az webapp config appsettings set -g "$rg" -n "$frontend" --settings \
    WEBSITES_PORT=8080 \
    WEBSITES_ENABLE_APP_SERVICE_STORAGE=false \
    API_BASE_URL="https://${api}.azurewebsites.net/api" \
    --output none

  echo "$env resources created:"
  echo "  Frontend: https://${frontend}.azurewebsites.net"
  echo "  Backend:  https://${api}.azurewebsites.net"
  echo "  KeyVault: $kv"
  echo "  Storage:  $storage"
}

# Shared resources
# A previous --no-wait deletion can leave an RG temporarily unavailable.
if az group exists -n "$SHARED_RG" | grep -qi true; then
  state=$(az group show -n "$SHARED_RG" --query properties.provisioningState -o tsv 2>/dev/null || true)
  if [[ "$state" == "Deleting" ]]; then
    echo "Waiting for previous deletion of $SHARED_RG..."
    for _ in {1..60}; do
      az group exists -n "$SHARED_RG" | grep -qi false && break
      sleep 5
    done
  fi
fi

create_rg "$SHARED_RG" shared

# Create ACR only when missing, then verify it before continuing.
if ! az acr show -g "$SHARED_RG" -n "$ACR_NAME" --output none 2>/dev/null; then
  echo "Creating ACR: $ACR_NAME in $LOCATION"
  for attempt in {1..6}; do
    if az acr create \
      -g "$SHARED_RG" \
      -n "$ACR_NAME" \
      -l "$LOCATION" \
      --sku Basic \
      --admin-enabled false \
      --output none; then
      break
    fi
    echo "ACR creation attempt $attempt failed; waiting for ARM propagation..."
    sleep 10
  done
fi

az acr show -g "$SHARED_RG" -n "$ACR_NAME" --query loginServer -o tsv >/dev/null

# One shared B1 plan keeps Total VMs requirement at 1.
ensure_shared_plan() {
  local attempts=0
  local plan_id=""

  while (( attempts < 6 )); do
    plan_id=$(az appservice plan show \
      -g "$SHARED_RG" \
      -n "$SHARED_PLAN" \
      --query id -o tsv 2>/dev/null || true)

    if [[ -n "$plan_id" ]]; then
      echo "App Service Plan $SHARED_PLAN exists and is verified." >&2
      printf '%s\n' "$plan_id"
      return 0
    fi

    echo "Creating missing App Service Plan: $SHARED_PLAN (attempt $((attempts + 1))/6)" >&2
    az group create -n "$SHARED_RG" -l "$LOCATION" \
      --tags project=WonderLearn environment=shared managed-by=azure-cli \
      --output none

    az appservice plan create \
      -g "$SHARED_RG" \
      -n "$SHARED_PLAN" \
      -l "$LOCATION" \
      --is-linux \
      --sku B1 \
      --number-of-workers 1 \
      --output none || true

    sleep 10
    attempts=$((attempts + 1))
  done

  echo "Unable to create or verify App Service Plan $SHARED_PLAN in $SHARED_RG." >&2
  return 1
}

SHARED_PLAN_ID=$(ensure_shared_plan)
if [[ -z "$SHARED_PLAN_ID" || "$SHARED_PLAN_ID" != /subscriptions/* ]]; then
  echo "Could not resolve a valid App Service Plan resource ID." >&2
  exit 1
fi

create_environment dev
create_environment prod

echo
echo "WonderLearn infrastructure created successfully."
echo "Region:          $LOCATION"
echo "Shared plan:     $SHARED_PLAN (one B1 worker shared by Dev and Prod)"
echo "ACR:             ${ACR_NAME}.azurecr.io"
echo "Dev frontend:    https://${DEV_FRONTEND}.azurewebsites.net"
echo "Dev backend:     https://${DEV_API}.azurewebsites.net"
echo "Prod frontend:   https://${PROD_FRONTEND}.azurewebsites.net"
echo "Prod backend:    https://${PROD_API}.azurewebsites.net"
echo
echo "Next: export MongoDB/OpenAI/JWT values and run azure/02-set-secrets-and-config.sh"