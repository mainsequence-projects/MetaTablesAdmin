import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { ApplicationPageHeader, ApplicationPageStack } from "@dev-mainsequence/command-center-sdk/layout";
import { DataTable, ResourceSelectionCheckbox } from "@dev-mainsequence/command-center-sdk/views";

type ContentElement = ReactElement<{ children?: ReactNode }>;
type MarkdownRow = { id: number; cells: ReactNode[] };

function elements(children: ReactNode): ContentElement[] {
  return Children.toArray(children).filter((child): child is ContentElement => isValidElement(child));
}

function text(children: ReactNode): string {
  return Children.toArray(children).map(child => isValidElement<{ children?: ReactNode }>(child)
    ? text(child.props.children) : String(child)).join("");
}

/** Retain rendered inline Markdown in cells while the SDK owns the table. */
function MarkdownTable({ children }: { children?: ReactNode }) {
  const rows = elements(children).flatMap(group => elements(group.props.children));
  const headers = elements(rows[0]?.props.children).map(cell => text(cell.props.children));
  const items = rows.slice(1).map((row, id) => ({ id, cells: elements(row.props.children).map(cell => cell.props.children) }));
  return <DataTable<MarkdownRow, number> items={items} getId={row => row.id} presentation="table"
    columns={headers.map((header, index) => ({
      id: String(index), header, renderCell: row => row.cells[index],
    }))} />;
}

const components: Components = {
  h1: ({ children, id }) => <ApplicationPageHeader id={id} title={children} titleAs="h2" />,
  h2: ({ children, id }) => <ApplicationPageHeader id={id} title={children} titleAs="h3" />,
  h3: ({ children, id }) => <ApplicationPageHeader id={id} title={children} titleAs="h3" />,
  table: MarkdownTable,
  input: ({ checked }) => <ResourceSelectionCheckbox checked={Boolean(checked)} disabled onChange={() => {}}
    ariaLabel={checked ? "Completed checklist item" : "Incomplete checklist item"} />,
};

export function MarkdownDocument({ content }: { content: string }) {
  return <ApplicationPageStack className="markdown-document" data-markdown-document>
    <Markdown remarkPlugins={[remarkGfm, remarkBreaks]} components={components} skipHtml>{content}</Markdown>
  </ApplicationPageStack>;
}
