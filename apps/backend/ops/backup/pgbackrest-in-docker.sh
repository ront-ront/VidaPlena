#!/bin/sh
set -eu
exec docker exec -u postgres vidaplena-backup-test pgbackrest "$@"
