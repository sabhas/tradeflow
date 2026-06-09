#!/bin/sh
set -eu

echo "Running database migrations..."
node /app/packages/db/dist/migrate.js

if [ "${RUN_SEED:-true}" = "true" ]; then
  echo "Seeding database..."
  node /app/packages/db/dist/seed.js
else
  echo "Skipping seed (RUN_SEED is not true)."
fi

echo "Database init complete."
