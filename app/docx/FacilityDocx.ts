import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  ExternalHyperlink,
  BorderStyle,
} from "docx";
import type { Report } from "@/lib/report";

// Builds an editable Word (.docx) of the report — real text + a real table, not
// an image. Same content/order as the PDF and preview, sourced from the shared
// `Report`. Loaded dynamically on download click, so docx stays off the initial
// bundle and the production-critical path.

const GREY = "52525B";
const LINK_BLUE = "1D4ED8";
const BORDER = { style: BorderStyle.SINGLE, size: 4, color: "D4D4D8" };
const cellBorders = {
  top: BORDER,
  bottom: BORDER,
  left: BORDER,
  right: BORDER,
};

function centered(children: TextRun[]): Paragraph {
  return new Paragraph({ alignment: AlignmentType.CENTER, children });
}

export async function generateFacilityDocxBlob(report: Report): Promise<Blob> {
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: report.rows.map(
      (r) =>
        new TableRow({
          children: [
            new TableCell({
              width: { size: 55, type: WidthType.PERCENTAGE },
              borders: cellBorders,
              children: [
                new Paragraph({
                  children: [new TextRun({ text: r.label, bold: true })],
                }),
              ],
            }),
            new TableCell({
              width: { size: 45, type: WidthType.PERCENTAGE },
              borders: cellBorders,
              children: [new Paragraph(r.value || "—")],
            }),
          ],
        }),
    ),
  });

  const doc = new Document({
    title: `Facility Assessment Snapshot - ${report.ccn}`,
    sections: [
      {
        children: [
          // Branding — INFINITE is a fixed brand name and is never replaced by
          // the facility name (which lives in the table under "Name of Facility").
          centered([
            new TextRun({
              text: "INFINITE — Managed by MEDELITE",
              bold: true,
              color: GREY,
            }),
          ]),
          centered([
            new TextRun({ text: "FACILITY ASSESSMENT SNAPSHOT", bold: true, size: 28 }),
          ]),
          centered([new TextRun({ text: report.state || "—", color: GREY })]),
          new Paragraph({ text: "" }),
          table,
          new Paragraph({ text: "" }),
          new Paragraph({
            children: [new TextRun({ text: "Medicare Care Compare source:", color: GREY })],
          }),
          new Paragraph({
            children: [
              new ExternalHyperlink({
                link: report.medicareUrl,
                children: [
                  new TextRun({
                    text: report.medicareUrl,
                    style: "Hyperlink",
                    color: LINK_BLUE,
                    underline: {},
                  }),
                ],
              }),
            ],
          }),
        ],
      },
    ],
  });

  return Packer.toBlob(doc);
}
