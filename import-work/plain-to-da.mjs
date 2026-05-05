#!/usr/bin/env node
// Convert an EDS .plain.html (div-based, what aem.live SERVES)
// into a da.live source document (table-based, what authors EDIT).
//
// Rules applied:
//  - Top-level <div> sections are separated by <hr>.
//  - Any <div class="block-name extra-classes"> becomes a <table> whose
//    first row is <th colspan=N> with the block name (variants in parens).
//    The block's child rows/cells map to <tr>/<td>.
//  - <div class="section-metadata"> is rendered as a "Section Metadata"
//    table; <div class="metadata"> as a "Metadata" table.
//  - Default content (h1/h2/h3/p/picture/a etc.) is preserved as-is.
//
// Usage: node plain-to-da.mjs <input.plain.html> <output.html>

import fs from 'node:fs';
import path from 'node:path';

const [, , inFile, outFile] = process.argv;
if (!inFile || !outFile) {
  console.error('Usage: node plain-to-da.mjs <input.plain.html> <output.html>');
  process.exit(1);
}

const html = fs.readFileSync(inFile, 'utf8');

// Lightweight DOM via linkedom (zero-config, ESM, no native deps).
// Falls back to a minimal regex parser only if linkedom is missing.
let parseHTML;
try {
  ({ parseHTML } = await import('linkedom'));
} catch {
  console.error('linkedom not installed. Run: npm i -D linkedom');
  process.exit(1);
}

const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);

const TITLE_CASE = (s) => s.replace(/(^|[-\s])(\w)/g, (_, b, c) => b.replace('-', ' ') + c.toUpperCase());

function blockHeaderName(classList) {
  const [name, ...variants] = classList;
  if (variants.length) return `${TITLE_CASE(name)} (${variants.join(', ')})`;
  return TITLE_CASE(name);
}

function maxColumnsInBlock(blockEl) {
  let max = 1;
  for (const row of blockEl.children) {
    if (row.tagName?.toLowerCase() === 'div') {
      max = Math.max(max, row.children.length || 1);
    }
  }
  return max;
}

function blockToTable(blockEl) {
  const classes = [...blockEl.classList];
  const header = blockHeaderName(classes);
  const cols = maxColumnsInBlock(blockEl);
  const table = document.createElement('table');
  // header row
  const trh = document.createElement('tr');
  const th = document.createElement('th');
  th.setAttribute('colspan', String(cols));
  th.textContent = header;
  trh.appendChild(th);
  table.appendChild(trh);
  // body rows
  for (const row of blockEl.children) {
    if (row.tagName?.toLowerCase() !== 'div') continue;
    const tr = document.createElement('tr');
    const cells = [...row.children].filter((c) => c.tagName?.toLowerCase() === 'div');
    if (cells.length === 0) {
      const td = document.createElement('td');
      td.setAttribute('colspan', String(cols));
      while (row.firstChild) td.appendChild(row.firstChild);
      tr.appendChild(td);
    } else {
      for (const cell of cells) {
        const td = document.createElement('td');
        while (cell.firstChild) td.appendChild(cell.firstChild);
        tr.appendChild(td);
      }
      // pad missing cells
      while (tr.children.length < cols) tr.appendChild(document.createElement('td'));
    }
    table.appendChild(tr);
  }
  return table;
}

function metadataKvToTable(divEl, label) {
  const table = document.createElement('table');
  const trh = document.createElement('tr');
  const th = document.createElement('th');
  th.setAttribute('colspan', '2');
  th.textContent = label;
  trh.appendChild(th);
  table.appendChild(trh);
  for (const row of divEl.children) {
    if (row.tagName?.toLowerCase() !== 'div') continue;
    const cells = [...row.children];
    const tr = document.createElement('tr');
    const tdK = document.createElement('td');
    const tdV = document.createElement('td');
    if (cells[0]) while (cells[0].firstChild) tdK.appendChild(cells[0].firstChild);
    if (cells[1]) while (cells[1].firstChild) tdV.appendChild(cells[1].firstChild);
    tr.appendChild(tdK);
    tr.appendChild(tdV);
    table.appendChild(tr);
  }
  return table;
}

// Walk top-level sections (children of body)
const body = document.body;
const sections = [...body.children].filter((c) => c.tagName?.toLowerCase() === 'div');

const out = document.createElement('main');

sections.forEach((section, idx) => {
  if (idx > 0) out.appendChild(document.createElement('hr'));

  // Process children of the section in order.
  for (const child of [...section.children]) {
    const tag = child.tagName?.toLowerCase();
    if (tag === 'div') {
      const cls = [...child.classList];
      if (cls.includes('section-metadata')) {
        out.appendChild(metadataKvToTable(child, 'Section Metadata'));
      } else if (cls.includes('metadata')) {
        out.appendChild(metadataKvToTable(child, 'Metadata'));
      } else if (cls.length > 0) {
        // a block: <div class="cards"> etc.
        out.appendChild(blockToTable(child));
      } else {
        // unclassed div — flatten its content
        for (const c of [...child.childNodes]) out.appendChild(c);
      }
    } else {
      out.appendChild(child);
    }
  }
});

const result = `<body>
  <header></header>
  ${out.outerHTML}
  <footer></footer>
</body>
`;

fs.writeFileSync(outFile, result, 'utf8');
console.error(`wrote ${outFile} (${fs.statSync(outFile).size} bytes)`);
