---
title: Settings
description: See the active runtime mode, review the runtime database, and check whether its setup is complete.
audience: end-user
pageType: feature
---

# Settings

## Open this page

Choose **Admin → Settings**, or <a href="/admin/settings">open Settings</a>. Platform admin access is required.

## What you can do

The **Runtime** section shows the API's active **API runtime mode** and its runtime database. In Local mode you set up the workspace's SQLite file here. In Hosted mode the deployment declares the database, and Settings shows it read-only. Review **Migrations** to see whether its database setup is current.

## Common tasks

- [Set up the runtime database](runtime-database.md).
- Compare **Applied in database**, **Latest in migration files**, and **Pending revisions**.

## Understand what you see

In Local mode, choosing a value in a control prepares a change; the action shown below it applies that change. **Run MetaTables migrations** changes the Local database; review the pending revisions before using it.

In Hosted mode, **Runtime database** shows the engine, the Environment Secret that holds the connection, the default schema, the TLS settings with any certificate Secrets, and the resolved host, port, database and login. Secret values are never shown. To change the database, edit `runtime_database` in the API's `configuration.yaml` or the Environment Secret, then deploy: the deployment's MetaTables system migrations Job verifies the database, applies migrations and registers it before the API rolls out.

**Credential storage** reports whether passwords can be saved securely.

## If something goes wrong

Use **Refresh runtime** after completing setup or correcting a problem. In Hosted mode, pending migrations and registration are applied by the next deployment. If credential storage is unavailable, ask your administrator to restore it before saving passwords.

Advanced reset options can destroy local data. They are not a routine remedy for a failed connection, missing permissions, or pending migrations.
