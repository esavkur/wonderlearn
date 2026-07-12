#!/usr/bin/env bash
set -euo pipefail
TARGET=${1:?target URL required}
mkdir -p reports/zap
docker run --rm --network host -v "$PWD/reports/zap:/zap/wrk/:rw" ghcr.io/zaproxy/zaproxy:stable zap-baseline.py -t "$TARGET" -r zap-report.html -J zap-report.json -I || true
