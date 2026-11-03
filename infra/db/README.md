# Local database

Postgres for local development.

```bash
docker compose up -d      # start
docker compose down       # stop
docker compose down -v    # stop and wipe data
```

Data persists in the `pgdata` volume across restarts.

The tests use their own database, `personal_document_manager_test`, so they never touch dev data. A fresh volume creates it through `init/`. A volume created before that needs it once:

```bash
docker compose exec postgres createdb -U postgres personal_document_manager_test
```
