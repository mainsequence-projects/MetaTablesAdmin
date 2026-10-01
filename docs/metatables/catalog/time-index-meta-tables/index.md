---
title: Time Index MetaTables
description: Inspect tables organized by time and follow their updates.
audience: end-user
pageType: feature
---

# Time Index MetaTables

Inspect tables organized by time and follow their updates.

## Open this page

Choose **MetaTables → Catalog → Time Index MetaTables**, or <a href="/time-index-meta-tables">open Time Index MetaTables</a>.

## What you can do

- Find a time-index table and open its details.
- Read **Description** for the table’s purpose and usage.
- Inspect **Stats** and follow **Updates** to the processes that populate it.
- Explore related tables in **ULM diagram**.
- Review **Access** and, when available, **Timescale Policies**.

## Common tasks

Search or filter the list, then select an item to open its details. Use the detail tabs to move between the available views.

## Understand what you see

This view focuses on time-index tables. Stats describe the data currently available, while updates describe the work that produces it. A capability or tab can be unavailable when the database does not support it or the application cannot obtain its current status.

## If something goes wrong

If a capability is pending, refresh and review any accompanying error before treating it as available. Missing statistics can mean that no data has been written yet. For a failed update, inspect its [Runs](../../monitoring/runs/index.md) and logs.
