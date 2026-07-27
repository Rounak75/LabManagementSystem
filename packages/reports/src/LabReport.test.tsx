// The PDF this package renders is the thing a patient actually holds, and the
// same renderer backs both the desktop print path and the portal download. These
// are characterisation tests over the rendered output: they were written against
// working code, so each was checked by breaking the source and confirming it
// failed before being kept.
import { describe, it, expect } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { isValidElement, type ReactElement, type ReactNode } from "react";

import { LabReport } from "./LabReport";
import type { LabReportProps, ResultGroup } from "./types";
import { TEST_SECTIONS_TABLE, mm } from "./layout-coords";

/** Every element in the tree, depth-first. */
function walk(node: ReactNode): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (!isValidElement(node)) return [];

  const el = node as ReactElement<{ children?: ReactNode }>;
  const nested = el.props?.children ? walk(el.props.children) : [];

  // Function components render lazily; call them so their output is walked too.
  if (typeof el.type === "function") {
    const rendered = (el.type as (p: unknown) => ReactNode)(el.props);
    return [el, ...walk(rendered), ...nested];
  }
  return [el, ...nested];
}

/** Flattened style of an element, whether it was given one object or an array. */
function styleOf(el: ReactElement): Record<string, unknown> {
  const raw = (el.props as { style?: unknown }).style;
  const parts = Array.isArray(raw) ? raw : [raw];
  return Object.assign({}, ...parts.filter(Boolean));
}

function textContent(el: ReactElement): string {
  const kids = (el.props as { children?: ReactNode }).children;
  if (typeof kids === "string" || typeof kids === "number") return String(kids);
  if (Array.isArray(kids)) return kids.filter((k) => typeof k === "string" || typeof k === "number").join("");
  return "";
}

const groups: ResultGroup[] = [
  {
    sectionTitle: "Clinical Biochemistry",
    tests: [
      { testName: "Blood Sugar Fasting", value: "182", unit: "mg/dL", refRange: "70 - 100", isAbnormal: true },
      { testName: "Serum Creatinine", value: "0.9", unit: "mg/dL", refRange: "0.6 - 1.2", isAbnormal: false },
    ],
  },
  {
    sectionTitle: "Haematology",
    tests: [
      { testName: "Haemoglobin", value: "13.4", unit: "g/dL", refRange: "13.0 - 17.0", isAbnormal: false },
      { testName: "Total Leucocyte Count", value: "14200", unit: "/cumm", refRange: "4000 - 11000", isAbnormal: true },
    ],
  },
];

const props: LabReportProps = {
  patient: {
    name: "Ramesh Kumar",
    age: 47,
    sex: "Male",
    visitDate: "2026-07-27T09:15:00.000Z",
    visitIdDisplay: "VIS-2026-00042",
    referringDoctor: "Dr. S. Mahato",
    phone: "9876543210",
  },
  lab: {
    name: "Golmuri Janch Ghar",
    address: "Golmuri, Jamshedpur",
    phone: "6202924306",
    timings: "7am - 8pm",
    pathologist: { name: "Dr. A. Verma", qualifications: "MD (Path)" },
    portalUrl: "https://golmurijanchghar.vercel.app",
  },
  groups,
};

const render = (overrides: Partial<LabReportProps> = {}) =>
  walk(LabReport({ ...props, ...overrides }));

describe("LabReport content", () => {
  it("prints every result it was given", () => {
    const texts = render().map(textContent);

    for (const group of groups) {
      for (const test of group.tests) {
        expect(texts).toContain(test.testName);
        expect(texts).toContain(test.value);
      }
    }
  });

  it("prints each section heading", () => {
    const texts = render().map(textContent);

    expect(texts).toContain("Clinical Biochemistry");
    expect(texts).toContain("Haematology");
  });

  it("prints the reference range beside the value", () => {
    const texts = render().map(textContent);

    expect(texts).toContain("70 - 100");
    expect(texts).toContain("4000 - 11000");
  });

  // The single most clinically load-bearing thing on the page: a value outside
  // its reference range has to look different from one inside it. If this ever
  // renders identically, a doctor reading the printout has no flag at all.
  it("distinguishes an abnormal value from a normal one", () => {
    const els = render();
    const abnormal = els.find((e) => textContent(e) === "182");
    const normal = els.find((e) => textContent(e) === "0.9");

    expect(styleOf(abnormal!)).not.toEqual(styleOf(normal!));
  });

  it("gives an abnormal value emphasis a reader can see", () => {
    const abnormal = render().find((e) => textContent(e) === "14200");
    const style = styleOf(abnormal!);

    expect(style.fontWeight).toBe(700);
    expect(style.color).toBeTruthy();
  });

  it("leaves a normal value unemphasised", () => {
    const normal = render().find((e) => textContent(e) === "13.4");
    const style = styleOf(normal!);

    expect(style.fontWeight).toBeUndefined();
    expect(style.color).toBeUndefined();
  });
});

describe("LabReport layout modes", () => {
  // ContentOnly prints onto pre-printed letterhead. Drawing the header band
  // over it would double up the lab's name and address on the paper.
  it("omits the letterhead decorations in ContentOnly", () => {
    const names = render({ layout: "ContentOnly" }).map((e) =>
      typeof e.type === "function" ? e.type.name : "",
    );

    expect(names).not.toContain("HeaderBand");
    expect(names).not.toContain("FooterBand");
    expect(names).not.toContain("ColumnHeaders");
  });

  it("still prints the results in ContentOnly", () => {
    const texts = render({ layout: "ContentOnly" }).map(textContent);

    expect(texts).toContain("Blood Sugar Fasting");
    expect(texts).toContain("182");
  });

  it("draws the letterhead in FullPage", () => {
    const names = render({ layout: "FullPage" }).map((e) =>
      typeof e.type === "function" ? e.type.name : "",
    );

    expect(names).toContain("HeaderBand");
    expect(names).toContain("FooterBand");
  });

  // The alignment sheet exists to position a printer, so patient data must not
  // be on it — those pages get handled loosely and thrown away.
  it("prints no patient data on the alignment sheet", () => {
    const texts = render({ layout: "AlignmentTest" }).map(textContent);

    expect(texts).not.toContain("Ramesh Kumar");
    expect(texts).not.toContain("182");
  });

  it("prints the crosshairs on the alignment sheet", () => {
    const names = render({ layout: "AlignmentTest" }).map((e) =>
      typeof e.type === "function" ? e.type.name : "",
    );

    expect(names).toContain("AlignmentCrosshairs");
  });
});

describe("LabReport access code footer", () => {
  it("is left off when no code was issued", () => {
    const names = render().map((e) => (typeof e.type === "function" ? e.type.name : ""));

    expect(names).not.toContain("AccessCodeFooter");
  });

  it("is printed when a code was issued", () => {
    const names = render({ accessCode: "K7P2QX" }).map((e) =>
      typeof e.type === "function" ? e.type.name : "",
    );

    expect(names).toContain("AccessCodeFooter");
  });
});

describe("LabReport calibration", () => {
  // Per-printer nudge. If offsets stopped applying, every lab with a calibrated
  // printer would silently go back to misaligned output on pre-printed paper.
  it("shifts the results table by the calibrated offset", () => {
    const shifted = render({ calibration: { xOffsetMm: 3, yOffsetMm: 5 } });
    const table = shifted.find((e) => typeof e.type === "function" && e.type.name === "TestSectionsTable");
    const view = walk((table!.type as (p: unknown) => ReactNode)(table!.props))[0];

    expect(styleOf(view!).top).toBe(mm(TEST_SECTIONS_TABLE.topMm + 5));
    expect(styleOf(view!).left).toBe(mm(TEST_SECTIONS_TABLE.leftMarginMm + 3));
  });

  it("leaves the table at its measured position with no calibration", () => {
    const table = render().find(
      (e) => typeof e.type === "function" && e.type.name === "TestSectionsTable",
    );
    const view = walk((table!.type as (p: unknown) => ReactNode)(table!.props))[0];

    expect(styleOf(view!).top).toBe(mm(TEST_SECTIONS_TABLE.topMm));
  });
});

// Everything above walks the element tree. This one drives the real PDF engine,
// so a change that renders as valid JSX but crashes react-pdf still gets caught.
describe("LabReport end to end", () => {
  it("renders a real PDF", async () => {
    const buffer = await renderToBuffer(LabReport(props) as ReactElement);

    expect(buffer.length).toBeGreaterThan(0);
    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 30_000);

  it("renders a real PDF with no results at all", async () => {
    const buffer = await renderToBuffer(LabReport({ ...props, groups: [] }) as ReactElement);

    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 30_000);

  // A long panel is the case that pushes past one page.
  it("renders a real PDF for a panel that overflows a page", async () => {
    const long: ResultGroup[] = [
      {
        sectionTitle: "Comprehensive Panel",
        tests: Array.from({ length: 120 }, (_, i) => ({
          testName: `Parameter ${i + 1}`,
          value: String(i),
          unit: "mg/dL",
          refRange: "0 - 100",
          isAbnormal: i % 7 === 0,
        })),
      },
    ];

    const buffer = await renderToBuffer(LabReport({ ...props, groups: long }) as ReactElement);

    expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  }, 30_000);
});
