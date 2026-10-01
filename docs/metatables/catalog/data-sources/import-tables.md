---
title: Import existing tables
description: Successfully imported tables become available in the catalog with their discovered definitions. Importing an existing registration refreshes its definition.
audience: end-user
pageType: task
---

# Import existing tables

## Before you start

The Data Source must offer an **Import** tab and you must have permission to register its existing tables.

## Steps

1. Open the Data Source and choose **Import**.
2. Select the schema and load its available tables.
3. Move the desired tables from the available list into the selection. Select related tables explicitly if you also want to register them.
4. Choose a namespace if you want to group the imported tables.
5. Review the selection, start the import, and check each reported result.

## Expected result

Successfully imported tables become available in the catalog with their discovered definitions. Importing an existing registration refreshes its definition.

## If something goes wrong

If some tables fail, inspect their individual errors. Earlier successful imports can remain even when later work stops. Confirm access to the source schema and retry only the work that needs attention. Importing registers existing tables; it does not copy their rows into a new database.
