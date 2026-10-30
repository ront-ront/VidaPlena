#!/bin/sh
set -eu
if [ "$#" -ne 1 ]; then
  printf '%s\n' '{"event":"ops.alert","kind":"backup_failed","reasonCode":"invalid_mode"}' >&2
  exit 2
fi
cd "$(dirname "$0")/../../../.."
exec flock -w 600 /tmp/vidaplena-backup-cycle.lock yarn workspace vida-plena-backend backup:cycle "$1"
