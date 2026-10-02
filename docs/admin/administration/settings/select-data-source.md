---
title: Select a runtime Data Source
description: The runtime uses the selected Data Source after you apply the change and complete any required setup.
audience: end-user
pageType: task
---

# Select a runtime Data Source

## Before you start

You need admin access. Each mode has its own Data Sources: Local lists its workspace database, Hosted lists the databases registered while Hosted is active. A Data Source added in Local never appears in Hosted.

## Steps

1. Open **Settings** and review the active mode and Data Source in **Runtime**.
2. If Local is active, choose Hosted in **API runtime mode** and choose **Switch to Hosted**. No Data Source is needed first.
3. In Hosted mode, register the database in [Data Sources](../../../metatables/catalog/data-sources/add-data-source.md). Its password is saved as a managed Secret.
4. Return to **Settings**, choose the Data Source from the list (choose **Refresh list** if you just added it), and choose **Select DataSource**.
5. Complete any required setup using **Finish DataSource setup** or **Use this DataSource** when offered. Review **Migrations**; if updates are pending, confirm the active target and use **Run MetaTables migrations** when you are ready to apply them.
6. Use **Refresh runtime** and confirm that the intended mode and Data Source are active.

## Expected result

The runtime uses the selected Data Source after you apply the change and complete any required setup.

## If something goes wrong

Choosing values alone does not switch the runtime. If a database you added is missing from the Hosted list, it was registered while Local was active; register it again in Hosted mode. If the action is disabled, review the status beside the selection. Check that the source is enabled and allows writing. Do not use a local database reset to resolve Hosted setup problems.
