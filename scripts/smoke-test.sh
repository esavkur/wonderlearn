#!/usr/bin/env bash
set -euo pipefail
FRONTEND_URL=${1:?frontend URL required}
BACKEND_URL=${2:?backend URL required}
echo "Testing $BACKEND_URL/api/health"
curl -fsS --retry 12 --retry-delay 10 "$BACKEND_URL/api/health" | tee reports/deployment/backend-health.json
echo "Testing $FRONTEND_URL/health"
curl -fsS --retry 12 --retry-delay 10 "$FRONTEND_URL/health"
echo "Testing frontend root"
curl -fsS "$FRONTEND_URL/" | grep -qi 'WonderLearn'
echo "Smoke tests passed"
