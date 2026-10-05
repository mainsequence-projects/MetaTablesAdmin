---
title: Find a table
description: The table that holds the data you need is open, found by its name or by what it contains.
audience: end-user
pageType: task
---

# Find a table

## Before you start

Search covers only the tables you can read. Choose the search that fits what you know:

- **Table search** matches the text you type against table names, identifiers, namespaces and UIDs. Use it when you know what the table is called.
- **Deep search** ranks tables by what they contain. It reads each table's description, labels and namespace, and every column's name and description. Use it when you know what data you need but not the table's name.

## Steps

1. Open **MetaTables**, or **Time Index MetaTables** to search only time-index tables.
2. In **Search**, choose **Table search** or **Deep search**.
3. Type in the search box:
   - For Table search, type part of the name, identifier, namespace or UID.
   - For Deep search, type a short English phrase that describes the data, such as `bond prices` or `daily FX rates`.
4. Optionally narrow the results with **Kind** and **Namespace**.
5. In Deep search, review **Matched columns** for each result: it lists the columns whose names contain your words. A table that matches both by its description and by its columns is usually the right one.
6. Select a table to open it, then read **Description** to confirm what each row holds.

## Expected result

The table that holds the data you need is open. Deep search lists results in order of relevance instead of by name, and an empty search box shows the whole list again.

## If something goes wrong

- **No results:** try other words. Use a synonym (`sovereign debt` for bonds), a market or vendor term, or a column name such as `clean price`. Describe the data rather than asking a question.
- **A table you expected is missing:** you may not have access to it. Ask its owner to share it with you instead of creating a new table.
- **Deep search misses a table with a poor description:** a table with no description is found only by its table and column names. Ask the table's owner to describe it.
