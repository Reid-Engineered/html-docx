import { Table, TableRow, TableCell, Paragraph, TextRun, BorderStyle, ShadingType, WidthType } from 'docx';
import { convertInline, resolveRunProps, BASE_PROPS } from './inline.js';

const TABLE_WIDTH_DXA = 9000; // ~6.25in, a typical content width
const BORDER_COLOR = '999999';
const BORDER_SIZE = 4;
const HEADER_SHADING_FILL = 'D9D9D9';

function tableBorders() {
  const border = { style: BorderStyle.SINGLE, size: BORDER_SIZE, color: BORDER_COLOR };
  return {
    top: border, bottom: border, left: border, right: border,
    insideHorizontal: border, insideVertical: border
  };
}

function parseSpanAttr(node, name) {
  const num = parseInt(node.getAttribute(name), 10);
  return Number.isFinite(num) && num > 0 ? num : 1;
}

function distributeColumnWidths(count, totalWidth) {
  const base = Math.floor(totalWidth / count);
  const widths = Array(count).fill(base);
  widths[count - 1] += totalWidth - base * count;
  return widths;
}

function sumColumnWidths(widths, start, span) {
  let sum = 0;
  for (let i = start; i < Math.min(start + span, widths.length); i++) sum += widths[i];
  return sum || widths[widths.length - 1] || 1;
}

/**
 * Walks HTML table rows tracking which columns are still "occupied" by an
 * ongoing rowspan from an earlier row (the standard HTML table layout
 * algorithm), calling `visitCell` for each real `<td>`/`<th>` at its
 * correct column index. docx auto-generates the vertical-merge
 * continuation cells for rowSpan itself -- this only needs to track where
 * NOT to place one of this row's own cells.
 * @param {Array<{cellNodes: Array, insideThead: boolean}>} rowDescriptors
 * @param {(cellNode: any, info: {colIndex: number, colSpan: number, rowSpan: number, isHeader: boolean}) => any} visitCell
 * @returns {{ rows: Array<Array<any>>, totalColumns: number }}
 */
function walkRows(rowDescriptors, visitCell) {
  const tracker = {};
  let maxCols = 0;
  const rows = [];

  for (const { cellNodes, insideThead } of rowDescriptors) {
    let colIndex = 0;
    const rowResult = [];

    for (const cellNode of cellNodes) {
      while ((tracker[colIndex] || 0) > 0) {
        tracker[colIndex]--;
        colIndex++;
      }

      const tagName = cellNode.tagName.toLowerCase();
      const isHeader = tagName === 'th' || insideThead;
      const colSpan = parseSpanAttr(cellNode, 'colspan');
      const rowSpan = parseSpanAttr(cellNode, 'rowspan');

      rowResult.push(visitCell(cellNode, { colIndex, colSpan, rowSpan, isHeader }));

      if (rowSpan > 1) {
        for (let c = colIndex; c < colIndex + colSpan; c++) {
          tracker[c] = Math.max(tracker[c] || 0, rowSpan - 1);
        }
      }
      colIndex += colSpan;
    }

    // Trailing columns still occupied by a rowspan from an earlier row,
    // past this row's own last cell, also consume one row of the span.
    for (const key of Object.keys(tracker)) {
      const col = Number(key);
      if (col >= colIndex && tracker[col] > 0) tracker[col]--;
    }

    maxCols = Math.max(maxCols, colIndex);
    rows.push(rowResult);
  }

  return { rows, totalColumns: maxCols || 1 };
}

function collectCellParagraph(node, { header }, convertOptions = {}) {
  const resolved = resolveRunProps(node, node.computedStyle || {}, BASE_PROPS);
  const inherited = header ? { ...resolved, bold: true } : resolved;

  const runs = [];
  const inlineOpts = { ...convertOptions, inherited };
  for (const child of node.childNodes) {
    runs.push(...convertInline(child, undefined, inlineOpts));
  }
  if (runs.length === 0) runs.push(new TextRun({ text: '' }));

  return new Paragraph({ children: runs });
}

function buildCell(node, { header, colSpan, rowSpan, width }, convertOptions = {}) {
  const options = {
    children: [collectCellParagraph(node, { header }, convertOptions)],
    width: { size: width, type: WidthType.DXA }
  };
  if (header) options.shading = { fill: HEADER_SHADING_FILL, type: ShadingType.CLEAR, color: 'auto' };
  if (colSpan > 1) options.columnSpan = colSpan;
  if (rowSpan > 1) options.rowSpan = rowSpan;
  return new TableCell(options);
}

/**
 * Converts an HTML `<table>` to a real docx `Table`. Flattens
 * `thead`/`tbody`/`tfoot` wrapping by finding all descendant `<tr>`s
 * directly; a row counts as a header row if it lives inside `<thead>`, and
 * a cell counts as a header cell if it's a `<th>` (either makes it
 * bold + shaded). `colspan`/`rowspan` are respected; explicit DXA
 * `columnWidths` on the table and `width` on every cell are set so column
 * sizing survives outside Word (percentage widths break in Google Docs).
 * @param {import('node-html-parser').HTMLElement} node
 * @param {Object} options
 * @returns {Array<Table>}
 */
export function convertTable(node, options = {}) {
  const trNodes = node.querySelectorAll('tr');
  if (trNodes.length === 0) return [];

  const rowDescriptors = trNodes.map(tr => {
    const parentTag = tr.parentNode && tr.parentNode.tagName
      ? tr.parentNode.tagName.toLowerCase()
      : '';
    const cellNodes = tr.childNodes.filter(
      c => c.nodeType === 1 && (c.tagName.toLowerCase() === 'td' || c.tagName.toLowerCase() === 'th')
    );
    return { cellNodes, insideThead: parentTag === 'thead' };
  });

  const { totalColumns } = walkRows(rowDescriptors, () => null);
  const columnWidths = distributeColumnWidths(totalColumns, TABLE_WIDTH_DXA);

  const { rows: rowCells } = walkRows(rowDescriptors, (cellNode, { colIndex, colSpan, rowSpan, isHeader }) =>
    buildCell(cellNode, {
      header: isHeader,
      colSpan,
      rowSpan,
      width: sumColumnWidths(columnWidths, colIndex, colSpan)
    }, options)
  );

  const tableRows = rowCells
    .filter(cells => cells.length > 0)
    .map(cells => new TableRow({ children: cells }));

  if (tableRows.length === 0) return [];

  return [new Table({
    rows: tableRows,
    width: { size: TABLE_WIDTH_DXA, type: WidthType.DXA },
    columnWidths,
    borders: tableBorders()
  })];
}
