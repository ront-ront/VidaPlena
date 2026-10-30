#!/bin/sh
set -eu
if [ "$(id -u)" = 0 ]; then
  mkdir -p /var/lib/postgresql/backup-repo
  chown postgres:postgres /var/lib/postgresql/backup-repo
  chmod 0700 /var/lib/postgresql/backup-repo
fi
exec docker-entrypoint.sh "$@"
