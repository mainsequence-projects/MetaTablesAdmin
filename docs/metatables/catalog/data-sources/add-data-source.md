---
title: Add a Data Source
description: The new Data Source is registered and available in the list. The current runtime Data Source stays selected until you change it in Settings.
audience: end-user
pageType: task
---

# Add a Data Source

## Before you start

You need admin access, database credentials, and the host, port, database name, and schema supplied by your database administrator.

## Steps

1. Open **Data Sources** and choose **Add DataSource**.
2. Enter a recognizable **Name** and choose the **Engine**.
3. Fill in **Host**, **Database name**, **Database user**, **Default schema**, and **Port**. For MySQL, the schema follows the database name.
4. Enter **Password** directly. Use **Show password** or **Hide password** if needed. When editing a source later, leave Password blank to keep its existing value.
5. Choose the encryption or TLS settings required by your database and set **Storage access**. Use read write for a source you intend to select for the runtime.
6. Choose **Test connection** and read the result. Correct the settings if the test fails.
7. Choose **Create DataSource** below the form to save it.

## Expected result

The new Data Source is registered and available in the list. The current runtime Data Source stays selected until you change it in Settings.

## If something goes wrong

A successful test does not save the form. If the test fails, check credentials, host, port, and encryption settings with your database administrator. If the form reports that credential storage is unavailable, ask an admin to restore it. SQLite is supplied by Local mode and is not added through this remote-database form.
