#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { convertHtmlToDocx } from '../src/convert.js';

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.log("Usage: html2docx <input.html> -o <output.docx>");
    process.exit(1);
  }

  const inputPath = args[0];
  let outputPath = 'output.docx';
  const oIdx = args.indexOf('-o');
  if (oIdx !== -1 && args[oIdx + 1]) {
    outputPath = args[oIdx + 1];
  }

  try {
    const html = fs.readFileSync(inputPath, 'utf8');
    const docxBuffer = await convertHtmlToDocx(html);
    fs.writeFileSync(outputPath, docxBuffer);
    console.log(`Successfully converted ${inputPath} to ${outputPath}`);
  } catch (err) {
    console.error("Error converting file:", err);
    process.exit(1);
  }
}

main();
