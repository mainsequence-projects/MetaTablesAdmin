---
title: Namespaces
description: Create namespaces, browse their tables and manage the roles that apply to every table in them.
audience: end-user
pageType: feature
---

# Namespaces

Create namespaces, browse their tables and manage the roles that apply to every table in them.

## Open this page

Choose **MetaTables → Catalog → Namespaces**, or <a href="/namespaces">open Namespaces</a>.

## What you can do

- Choose **Create namespace** to create one whose name is free. You become its
  owner and land on its **Access** tab to grant roles. An application's
  migration Job needs no namespace created first: its first registration into a
  missing namespace creates it and gives the Job **Editor**.
- Search for a namespace and open its **Overview**.
- Use **Tables** to browse its tables and filter by type.
- Use **Access** to see your role and, as an owner, grant, change or revoke roles on the namespace. They work like [table roles](../tables/share-table.md).
  If you manage the workload that created the namespace, you do the same without a role of your own.
- Open **Access map** to see who reaches the namespace's tables: users and
  workloads, the Teams they belong to, the roles granted on the
  namespace and on each table, and the tables themselves. Select any box to
  highlight everything it reaches and everything that reaches it. Turn on
  **Relationships** to add foreign keys and updater inputs to tables in other
  namespaces.

## Common tasks

Search or filter the list, then select an item to open its details. Use the detail tabs to move between the available views.

## Understand what you see

A namespace is an access group. A role on a namespace gives the table role of the same name on every table in it, including tables added later. Removing a direct role on one table does not remove access inherited from the namespace or a Team.

A namespace that a workload's registration created names that workload under **Who has access**. The people who manage the workload see the namespace and decide who has access to it: they grant any role, **Owner** included, to people and to Teams they belong to, and never **Owner** to a workload. They hold no role, so this gives them no access to its tables. **Your access** lists it as **Manages the creating workload**, and **Explain access** says so when it is why you can do an action.

## If something goes wrong

If a namespace or table is missing, check the current filters and ask one of its owners for a role. A namespace a workload created has no owner until one of the people who manage that workload grants **Owner** from its **Access** tab. If a name is taken, creation names its owners when you can see them. If a user retains access after a table-level change, check their Team membership and the namespace roles.
