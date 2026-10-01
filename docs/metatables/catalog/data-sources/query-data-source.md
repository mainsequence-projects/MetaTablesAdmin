---
title: Query a Data Source
description: You can inspect a page of results from the selected Data Source without changing its data.
audience: end-user
pageType: task
---

# Query a Data Source

## Before you start

You need access to the Data Source and the tables you want to read.

## Steps

1. Open **Data Sources**, select a source, and choose **Query builder**.
2. For the active runtime Data Source, select a table and the columns you want, then choose **Build SELECT query**. Leave the column selection empty to include all available columns.
3. Review the SQL, choose the page size, and select **Run query**. This view supports read queries.
4. Use the result paging controls to inspect more rows. For another registered Data Source, the view instead lets you select a table or view and browse its rows with column and ordering controls.

## Expected result

You can inspect a page of results from the selected Data Source without changing its data.

## If something goes wrong

If a table is absent, check access and refresh the available choices. Review any query error before retrying. Large reads may take time; select only the columns and rows you need. Pages can change when the underlying data changes, particularly when the ordering is not unique.
