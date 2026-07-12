#!/usr/bin/env bash
set -euo pipefail
: "${UNIQUE_SUFFIX:?}" "${BOOKS_SOURCE:?Example /mnt/c/NCERT-Books}"
ENVIRONMENT=${1:-dev}
ACCOUNT=stwonderlearn${ENVIRONMENT}${UNIQUE_SUFFIX}
az storage blob upload-batch --account-name "$ACCOUNT" --destination books --source "$BOOKS_SOURCE" --auth-mode login --overwrite
az storage blob list --account-name "$ACCOUNT" --container-name books --auth-mode login --query '[].name' -o tsv | head
