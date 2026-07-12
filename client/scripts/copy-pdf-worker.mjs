import { copyFile, mkdir } from "node:fs/promises";
import path from "node:path";
await mkdir("public", { recursive: true });
await copyFile(path.resolve("node_modules/pdfjs-dist/build/pdf.worker.min.mjs"), path.resolve("public/pdf.worker.min.mjs"));
console.log("Copied matching PDF.js worker to public/pdf.worker.min.mjs");
