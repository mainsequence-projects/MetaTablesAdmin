---
title: Runs
description: Review past executions and identify where an update failed or stopped.
audience: end-user
pageType: feature
slug: /metatables/catalog/runs/
---

# Runs

Review past executions and identify where an update failed or stopped.

## Open this page

Choose **MetaTables → Monitoring → Runs**, or <a href="/runs">open Runs</a>.

## What you can do

- Narrow the history with the filters above it: updater, outcome, start time, and **Root invocations only**. **Clear filters** keeps your selected run.
- Select a run from the history to inspect its identity, outcome, timing, and invocation timeline.
- Follow **Parent execution** on a dependency attempt to open the run that started the surrounding execution.
- Select an updater in the **Invocation** timeline to open that attempt, or open **Lineage graph** to see the saved tables and updaters.
- Read the logs of the whole invocation, or switch to **This attempt**.
- Use **Hide history** to give the run more room and **Show history** to bring the list back.
- Use **Previous**, **Next**, and **Refresh runs** to browse history.

## Common tasks

- [Investigate a run](inspect-run.md)

## Understand what you see

Run history is shown newest first. Each row is a recorded attempt with its own Run identifier. An execution can contain several attempts; dependency attempts appear indented under the root of their execution when both are listed.

The header names the selected Run's updater and shows its outcome, duration, start time, and identifier. It also says whether the Run is the root of its execution or a dependency attempt. **Invocation** places every attempt of the execution on one timeline: the pale bar is the attempt from start to finish, the solid bar is its calculation, and a dashed line shows time spent waiting for dependencies. Small ticks mark log events; warnings and errors take the theme's warning and danger colors. The selected Run's row is highlighted.

**Logs** lists the execution's events in time order, counted from its start, with the attempt that wrote each line. Select a line to see its error details and context.

Node states distinguish successful work from failed, blocked, skipped, or unexecuted work. An unfinished record alone does not establish that work is still running. Records without a captured graph still show their Run details and logs when available.

**Last hour**, **Last 24 hours**, and **Last 7 days** count back from when you choose them or reload the page. **Custom range** uses the local date and time you enter. Review the selected run’s timestamps when comparing executions.

## If something goes wrong

If the list is empty, clear the outcome, updater, and time filters. If logs have expired or are unavailable, use the saved status and timing and open the updater for context. Closing the navigation panel with its X should leave the selected run open.
