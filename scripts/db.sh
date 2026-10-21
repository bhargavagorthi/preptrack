#!/usr/bin/env bash
# Start the dev database. If Docker's container is broken (common after a codespace sleeps),
# recreate it on the same data volume, so no data is lost.
NAME=preptrack-db

if ! docker start "$NAME" >/dev/null 2>&1; then
  echo "Database container is broken or missing. Recreating it (your data volume is kept)…"
  docker rm -f "$NAME" >/dev/null 2>&1
  docker run -d --name "$NAME" \
    -e POSTGRES_PASSWORD=devpassword -e POSTGRES_DB=preptrack \
    -p 5432:5432 -v preptrack-data:/var/lib/postgresql/data \
    postgres:17 >/dev/null || { echo "Couldn't create the database container."; exit 1; }
fi

for i in $(seq 1 30); do
  if docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; then
    echo "Database ready."
    exit 0
  fi
  sleep 1
done
echo "Database didn't become ready in time."
exit 1
