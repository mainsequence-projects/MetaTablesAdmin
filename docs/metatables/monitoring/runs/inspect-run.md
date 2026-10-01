---
title: Investigate a run
description: You can identify the affected attempt and distinguish its failure from downstream work that did not execute.
audience: end-user
pageType: task
slug: /metatables/catalog/runs/inspect-run/
---

# Investigate a run

## Before you start

Identify the updater, approximate start time, or outcome you want to investigate.

## Steps

1. Open **Runs** and narrow the history with the filters above it: updater, outcome, or start time.
2. Select the run and review its updater, outcome, duration, start time, and identifier. For a dependency attempt, follow **Parent execution** if you need to open the surrounding execution.
3. Review the **Invocation** timeline. Find the first attempt that failed, then confirm that later attempts are blocked or not run rather than failed themselves. Select an updater's name to open that attempt.
4. Read the logs. Error ticks on the timeline show where failures were logged. Switch to **This attempt** or choose a level to narrow the list, select a line for its error details, and refresh if necessary.
5. Follow **Open updater** or **Output** when you need more context. Open **Lineage graph** to see the tables each updater read and wrote.

## Expected result

You can identify the affected attempt and distinguish its failure from downstream work that did not execute.

## If something goes wrong

Clear filters if history or logs appear empty. Logs may no longer be available even when the saved run remains. An unfinished status does not by itself confirm an active process. Preserve the run identifier when asking the update owner for help.
