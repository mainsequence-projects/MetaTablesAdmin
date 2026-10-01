---
title: Time Index Table Updates
description: Understand the updates that produce time-index data and trace their dependencies.
audience: end-user
pageType: feature
---

# Time Index Table Updates

Understand the updates that produce time-index data and trace their dependencies.

## Open this page

Choose **MetaTables → Catalog → Time Index Table Updates**, or <a href="/data-updates">open Time Index Table Updates</a>.

## What you can do

- Search for an update and open **Details**.
- Use **Dependencies Graphs** to understand related updates.
- Open **Historical Updates** to inspect previous attempts.
- Use **Logs** to investigate an attempt or recent activity.

## Common tasks

Search or filter the list, then select an item to open its details. Use the detail tabs to move between the available views.

## Understand what you see

The dependency view describes relationships between updates. A historical run records what happened during a particular execution, so its graph can differ from the current dependency view. This page helps you inspect work; it does not provide a general control to start or schedule updates.

## If something goes wrong

If no history is shown, check whether the update has run and clear any filters. Missing logs do not prove that an update did not run: log availability and run history can differ. Use the saved outcome and timestamps in [Runs](../../monitoring/runs/index.md).
