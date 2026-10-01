---
title: Settings
description: Choose the runtime mode and Data Source, and check whether database setup is complete.
audience: end-user
pageType: feature
---

# Settings

## Open this page

Choose **Admin → Settings**, or <a href="/admin/settings">open Settings</a>. Platform admin access is required.

## What you can do

The **Runtime** section brings together **API runtime mode** and **Data Source**. Choose Local to use the local SQLite Data Source, or prepare a registered Data Source for Hosted mode. Review **Migrations** to see whether its database setup is current.

## Common tasks

- [Select a runtime Data Source](select-data-source.md).
- Add a database first in [Data Sources](../../../metatables/catalog/data-sources/add-data-source.md), then return here and refresh the available list.
- Compare **Applied in database**, **Latest in migration files**, and **Pending revisions** before applying migrations.

## Understand what you see

Choosing a mode or a Data Source in a control prepares a change. The action shown below it applies that change. Preparing Hosted settings while Local is active does not switch the runtime on its own.

A ready Data Source can be selected for use. A source marked as needing initialization, registration, or migrations needs the corresponding setup action first. Disabled actions should be read together with the adjacent status message.

**Migrations** compares the database’s current version with the available updates. **Run MetaTables migrations** changes the selected active database; review the target and pending revisions before using it. **Credential storage** reports whether passwords can be saved securely.

## If something goes wrong

Use **Refresh runtime** after completing setup or correcting a problem. If no eligible Hosted Data Source is listed, register one first and check that its storage access permits writing. If credential storage is unavailable, ask your administrator to restore it before saving passwords.

Advanced reset options can destroy local data. They are not a routine remedy for a failed connection, missing permissions, or pending migrations.
