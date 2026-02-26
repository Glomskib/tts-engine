#!/usr/bin/env bash
# heartbeat.sh — single-line status heartbeat
# Usage: ./heartbeat.sh <worker-name> [detail]

WORKER="${1:?Usage: heartbeat.sh <worker-name> [detail]}"
DETAIL="${2:-ok}"
echo "$(date -u +"%Y-%m-%dT%H:%M:%SZ") STATUS ${WORKER} ${DETAIL}"
