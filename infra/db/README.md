# Local database

Postgres for local development.

```bash
docker compose up -d      # start
docker compose down       # stop
docker compose down -v    # stop and wipe data
```

Data persists in the `pgdata` volume across restarts.
