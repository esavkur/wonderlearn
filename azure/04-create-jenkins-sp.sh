#!/usr/bin/env bash
set -euo pipefail
: "${AZURE_SUBSCRIPTION_ID:?}" "${UNIQUE_SUFFIX:?}"
SP_JSON=$(az ad sp create-for-rbac --name sp-wonderlearn-jenkins-${UNIQUE_SUFFIX} --skip-assignment -o json)
APP_ID=$(echo "$SP_JSON"|jq -r .appId)
for RG in rg-wonderlearn-dev rg-wonderlearn-prod; do SCOPE=/subscriptions/$AZURE_SUBSCRIPTION_ID/resourceGroups/$RG; az role assignment create --assignee "$APP_ID" --role Contributor --scope "$SCOPE"; done
ACR_ID=$(az acr show -n acrwonderlearn${UNIQUE_SUFFIX} --query id -o tsv); az role assignment create --assignee "$APP_ID" --role AcrPush --scope "$ACR_ID"
echo "$SP_JSON" | jq .
echo 'Save appId/password/tenant securely in Jenkins credential azure-sp-wonderlearn.'
