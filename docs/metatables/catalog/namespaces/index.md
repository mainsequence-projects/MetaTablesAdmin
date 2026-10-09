---
title: Namespaces
description: Browse groups of tables and understand sharing across a namespace.
audience: end-user
pageType: feature
---

# Namespaces

Browse groups of tables and understand sharing across a namespace.

## Open this page

Choose **MetaTables → Catalog → Namespaces**, or <a href="/namespaces">open Namespaces</a>.

## What you can do

- Search for a namespace and open its **Overview**.
- Use **Tables** to browse its tables and filter by type.
- Review **Access** to understand namespace sharing.
- Open **Access map** to see who reaches the namespace's tables: users and
  workloads, the Teams they belong to, the Reader and Writer grants on the
  namespace and on each table, and the tables themselves. Select any box to
  highlight everything it reaches and everything that reaches it. Turn on
  **Relationships** to add foreign keys and updater inputs to tables in other
  namespaces.
- Admins manage namespace access and can create namespaces in [Security](../../../admin/administration/security/index.md).

## Common tasks

Search or filter the list, then select an item to open its details. Use the detail tabs to move between the available views.

## Understand what you see

Namespaces group related tables. Namespace sharing can give a user access in addition to a table’s direct sharing. Removing a direct assignment on one table does not remove access inherited from a namespace or team.

## If something goes wrong

If a namespace or table is missing, check the current filters and ask an admin to review access. If a user retains access after a table-level change, check their team membership and namespace sharing.
