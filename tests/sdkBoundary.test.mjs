import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

const sourceRoot = new URL("../src/", import.meta.url);
const sdk = JSON.parse(await readFile(new URL("../node_modules/@dev-mainsequence/command-center-sdk/package.json", import.meta.url), "utf8"));

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(entry => {
    const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
    return entry.isDirectory() ? files(url) : /\.(tsx?|css)$/.test(entry.name) ? [url] : [];
  }));
  return nested.flat();
}

test("standard UI controls and surfaces cannot be rebuilt in application JSX", async () => {
  const violations = [];
  const ownedTags = new Set(["button", "input", "textarea", "select", "option", "label", "table", "dialog", "progress", "nav", "aside", "h1", "h2", "h3"]);
  for (const file of await files(sourceRoot)) {
    if (!file.pathname.endsWith(".tsx")) continue;
    const source = ts.createSourceFile(fileURLToPath(file), await readFile(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    function inspect(node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = node.tagName.getText(source);
        const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        if (ownedTags.has(tag)) violations.push(`${file.pathname}:${line}: use the SDK instead of <${tag}>`);
        if (["div", "span", "a"].includes(tag)) {
          for (const attribute of node.attributes.properties) {
            if (ts.isJsxAttribute(attribute) && attribute.name.getText(source) === "role" && attribute.initializer && ts.isStringLiteral(attribute.initializer) && ["button", "checkbox", "combobox", "tab"].includes(attribute.initializer.text)) {
              violations.push(`${file.pathname}:${line}: custom interactive ${attribute.initializer.text}`);
            }
          }
        }
      }
      ts.forEachChild(node, inspect);
    }
    inspect(source);
  }
  assert.deepEqual(violations, []);
});

test("SDK imports use published exports and authored CSS does not restyle SDK components", async () => {
  const violations = [];
  for (const file of await files(sourceRoot)) {
    const text = await readFile(file, "utf8");
    if (file.pathname.endsWith(".css")) {
      if (/\.cc-[\w-]+/.test(text)) violations.push(`${file.pathname}: SDK component CSS override`);
      continue;
    }
    const source = ts.createSourceFile(fileURLToPath(file), text, ts.ScriptTarget.Latest, true);
    for (const node of source.statements) {
      if (!ts.isImportDeclaration(node) || !ts.isStringLiteral(node.moduleSpecifier)) continue;
      const name = node.moduleSpecifier.text;
      const prefix = "@dev-mainsequence/command-center-sdk";
      if (!name.startsWith(prefix)) continue;
      const key = name === prefix ? "." : "." + name.slice(prefix.length);
      if (!(key in sdk.exports)) violations.push(`${file.pathname}: unpublished SDK import ${name}`);
    }
  }
  assert.deepEqual(violations, []);
});
