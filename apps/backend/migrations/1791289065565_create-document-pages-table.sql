-- Up Migration
-- Each document's extracted text, one row per page, so answers can point to the page they came from.

-- The primary key's index also serves loading a document's pages: where document_id = $1 order by page_number.
create table document_pages (
    document_id uuid not null references documents (id) on delete cascade,
    page_number integer not null check (page_number >= 1),
    text text not null,
    primary key (document_id, page_number)
);

-- Down Migration

drop table document_pages;
