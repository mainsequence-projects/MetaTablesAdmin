---
title: Select a runtime Data Source
description: The runtime uses the selected Data Source after you apply the change and complete any required setup.
audience: end-user
pageType: task
---

# Select a runtime Data Source

## Before you start

You need admin access. For Hosted mode, first register an eligible Data Source in Data Sources; you do not create it in Settings.

## Steps

1. Open **Settings** and review the active mode and Data Source in **Runtime**.
2. Choose Hosted in **API runtime mode** to prepare its settings.
3. Choose a registered Data Source from the available list. If you just added one, choose **Refresh list**. Choose **Select DataSource** to save the selection.
4. Review the selected source and its setup status. While Local is active, preparing this selection leaves Local running.
5. Apply the change with **Switch to Hosted**, or **Use this DataSource** when changing an already Hosted runtime.
6. Complete any required setup in Hosted mode using **Finish DataSource setup** when offered. Review **Migrations**; if updates are pending, confirm the active target and use **Run MetaTables migrations** when you are ready to apply them.
7. Use **Refresh runtime** and confirm that the intended mode and Data Source are active.

## Expected result

The runtime uses the selected Data Source after you apply the change and complete any required setup.

## If something goes wrong

Choosing values alone does not switch the runtime. If the action is disabled, review the status beside the selection. Check that the source is enabled and allows writing. Do not use a local database reset to resolve Hosted setup problems.
