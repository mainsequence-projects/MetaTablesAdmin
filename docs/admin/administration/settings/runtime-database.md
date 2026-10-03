---
title: Set up the runtime database
description: The runtime database is active and its migrations are up to date, set up in Settings for Local mode or by a deployment for Hosted mode.
audience: end-user
pageType: task
---

# Set up the runtime database

## Before you start

You need admin access. Open **Settings** and check **API runtime mode**: Local uses one SQLite file for this workspace, which you set up in Settings. In Hosted mode the deployment declares the database, so Settings only shows it.

## Steps

1. In Local mode, review the SQLite file under **DataSource**. To use another file, choose **Edit configuration**, enter its path and choose **Check DataSource**.
2. Still in Local mode, use **Run MetaTables migrations**, **Finish DataSource setup** or **Use this DataSource** when offered. Review **Migrations** before applying pending revisions.
3. In Hosted mode, review **Runtime database**: the engine, the Environment Secret that holds the connection, the default schema, the TLS settings and the connection it resolves to (host, port, database and login).
4. To change the hosted database, edit `runtime_database` in the API's `configuration.yaml` or the Environment Secret it names, then deploy. The deployment's MetaTables system migrations Job verifies the database, applies migrations and registers it before the API rolls out.
5. Use **Refresh runtime** and confirm that the database is **Active** and **Migrations** shows **Up to date**.

## Expected result

The runtime database is active and its migrations are up to date, set up in Settings for Local mode or by a deployment for Hosted mode.

## If something goes wrong

If Hosted Settings reports pending migrations, or that the database needs registration, deploy the API; nothing runs from Settings. If the status shows **Needs attention**, the database login lacks a permission MetaTables needs; the message names what the database administrator must grant, and the next deployment can then continue. A Data Source added in Data Sources never becomes the runtime database. Do not use a local database reset to resolve Hosted setup problems.
