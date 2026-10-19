---
title: Security
description: Database permission state, the security check and access history across the catalog.
audience: end-user
pageType: feature
---

# Security

## Open this page

Choose **Admin → Security**, or <a href="/admin/security">open Security</a>. Platform admin access is required.

## What you can do

Review **Database permissions** and run the security check. Under **Access history**, find any table or namespace, including one you hold no role on, and review its role changes; the history survives deletion. Choose **Open its Access panel** to change its roles.

## Common tasks

To recover a table or namespace without an owner, open its Access panel and grant **Owner** to the intended person or Team. Any person creates namespaces from **Namespaces**; see [Share a table](../../../metatables/catalog/tables/share-table.md) for granting roles.

## Understand what you see

Organization admins hold every action on every namespace and table, reading and writing data included, without a role of their own. Owners manage access on each object’s Access tab. Namespace roles and Team membership also contribute to a user’s access.

## If something goes wrong

If Security is unavailable, verify your platform role with an admin. If a saved change does not have the expected effect, use **Explain access** on the object to see which roles apply.
