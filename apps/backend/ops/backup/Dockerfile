FROM postgres:17-alpine
RUN apk add --no-cache pgbackrest
COPY backup-entrypoint.sh /usr/local/bin/backup-entrypoint.sh
RUN chmod 0755 /usr/local/bin/backup-entrypoint.sh
ENTRYPOINT ["backup-entrypoint.sh"]
CMD ["postgres"]
