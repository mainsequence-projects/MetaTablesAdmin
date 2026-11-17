---
title: Share a table
description: Grant, change or revoke a role on a table after reading what the role allows.
audience: end-user
pageType: task
---

# Share a table

## Before you start

You need the **Owner** role on the table, directly, through a Team or through one of
its namespaces, to decide who has access. Without it you can still revoke your own role,
and grant the workloads you manage a role up to your own.

Roles are nested, each including the one before it:

- **Metadata viewer**: see the table's description, schema and lineage.
- **Data viewer**: also read and query its rows.
- **Data writer**: also insert, update and delete rows.
- **Editor**: also change, migrate, operate and delete the table, and see who has access.
- **Owner**: also decide who has access. Owner is for people and Teams, never workloads.

## Steps

1. Open the table and choose **Access**.
2. Under **Grant or change a role**, search for a person, Team or workload if it is not listed, then choose it under **User or Team**.
3. Choose a **Role**. Read what it allows, what it can cause and what it does not include.
4. Choose **Review grant**, check the texts again, and choose **Grant role**.
5. To change someone's role, choose **Change role** on their row; to remove it, choose **Revoke**.
6. To share the table with everyone who has a role on a namespace, choose that namespace under **Namespaces → Add to a namespace**, then **Add to namespace**. You need **Editor** or **Owner** on the table and on that namespace. **Remove** takes the table out of a namespace again.
7. Expand **Explain access**, choose an action and a user, and choose **Explain** to see which roles let them do it. **Access history** lists past changes.

## Expected result

The role is saved and listed under **Who has access**, with who granted it and when. A namespace you added is listed under **Namespaces** as put there by **A person**.

## If something goes wrong

If someone changed the table's access after you opened it, the change is refused; choose **Reload access** and review it again. Roles granted on the table's namespaces are listed under **From its namespaces**, each with the namespace it comes from, and change only on that namespace's Access panel. Team membership can still give access after a direct role is revoked.

A table can be in several namespaces, and the strongest role across them applies. A namespace listed as put there by **The application's code** comes back with the application's next migration if you remove it here; change the code to remove it for good. The last namespace of a table can be removed only when someone holds **Owner** on the table directly.
