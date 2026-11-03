-- Creates the database the test suites use, so running them never touches dev data (see each app's .env.test).
-- Postgres runs this only when it creates a fresh volume; infra/db/README.md covers an existing one.
create database personal_document_manager_test;
