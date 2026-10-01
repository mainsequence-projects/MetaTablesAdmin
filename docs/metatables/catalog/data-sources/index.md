---
title: Data Sources
description: Find the databases available to you and inspect their tables.
audience: end-user
pageType: feature
---

# Data Sources

Find the databases available to you and inspect their tables.

## Open this page

Choose **MetaTables → Catalog → Data Sources**, or <a href="/data-sources">open Data Sources</a>.

## What you can do

- Search the list by name and open a Data Source. The engine icon helps distinguish PostgreSQL, Timescale, MySQL, MSSQL, and SQLite.
- Use **Details** to review its database and access settings.
- Open **Query builder** to inspect data.
- Where available, use **Import** to register existing tables in the catalog.
- Admins can add Data Sources, test their settings, and edit manageable sources.

## Common tasks

- [Add a Data Source](add-data-source.md)
- [Query a Data Source](query-data-source.md)
- [Import existing tables](import-tables.md)

## Understand what you see

A Data Source represents a database. Registering one makes it available in the list; it does not automatically select it for the runtime. Admins choose that separately in [Settings](../../../admin/administration/settings/index.md).

The local SQLite Data Source comes from Local runtime mode. It is not an engine option for registering another remote database. Some actions depend on the selected Data Source, its storage access, and your permissions.

Removing a registration removes the catalog entry, not the database or its data. The active runtime Data Source cannot be removed.

## If something goes wrong

If a source is missing, clear the search and refresh the list. Ask an admin to check its registration and access. If the page reports that the active Data Source needs migrations, an admin must finish setup in Settings. A failed connection test does not create or update the Data Source.
