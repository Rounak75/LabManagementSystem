// Printing onto the lab's pre-printed stationery. Two things have to be true at
// once: the drawn letterhead must not be re-printed on top of the paper's own,
// and the results must not slide up into the space the paper's masthead
// occupies. The second is the one that silently ruins a stack of reports, so
// the reserve is asserted in millimetres rather than trusted.
import { describe, it, expect } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";

import {
  validate,
  resolveLetterhead,
  mmToPt,
  MAX_RESERVE_MM,
  DEFAULT_HEADER_RESERVE_MM,
  type TemplateConfig,
} from "@shared/template-config";
import { DefaultReportTemplate } from "@/pdf/DefaultReportTemplate";
import { GolmuriStandardTemplate } from "@/pdf/GolmuriStandardTemplate";
import { sampleData } from "@/pdf/sampleData";

const BASE: TemplateConfig = {
  headerText: "",
  footerText: "",
  signatureLine: "",
  fontFamily: "Inter",
  fontSize: 11,
  accentColor: "#0f766e",
  sections: { logo: true, doctorInfo: true, parametersTable: true, abnormalLegend: true, disclaimer: true },
  columns: { testName: true, result: true, unit: true, referenceRange: true, flag: true, comments: true },
};

/** Every element in the tree, depth-first, rendering function components. */
function walk(node: ReactNode): ReactElement[] {
  if (Array.isArray(node)) return node.flatMap(walk);
  if (!isValidElement(node)) return [];
  const el = node as ReactElement<{ children?: ReactNode }>;
  const nested = el.props?.children ? walk(el.props.children) : [];
  if (typeof el.type === "function") {
    const rendered = (el.type as (p: unknown) => ReactNode)(el.props);
    return [el, ...walk(rendered), ...nested];
  }
  return [el, ...nested];
}

function styleOf(el: ReactElement): Record<string, unknown> {
  const raw = (el.props as { style?: unknown }).style;
  const parts = Array.isArray(raw) ? raw : [raw];
  return Object.assign({}, ...parts.filter(Boolean));
}

function allText(els: ReactElement[]): string {
  return els
    .map((el) => {
      const kids = (el.props as { children?: ReactNode }).children;
      if (typeof kids === "string" || typeof kids === "number") return String(kids);
      if (Array.isArray(kids))
        return kids.filter((k) => typeof k === "string" || typeof k === "number").join("");
      return "";
    })
    .join(" ");
}

const componentNames = (els: ReactElement[]) =>
  els.map((e) => (typeof e.type === "function" ? e.type.name : ""));

/** The <Page>'s resolved style, where the reserve lands. */
function pageStyle(els: ReactElement[]): Record<string, unknown> {
  const page = els.find((e) => styleOf(e).paddingHorizontal !== undefined);
  if (!page) throw new Error("no page element found");
  return styleOf(page);
}

describe("resolveLetterhead", () => {
  it("changes nothing when the layout is FullPage", () => {
    const r = resolveLetterhead(BASE);
    expect(r.contentOnly).toBe(false);
    expect(r.skipHeader).toBe(false);
    expect(r.skipFooter).toBe(false);
    expect(r.headerReserveMm).toBe(0);
  });

  it("drops the lab's own bands in ContentOnly but keeps the result scaffolding", () => {
    const r = resolveLetterhead({ ...BASE, defaultLayout: "ContentOnly" });
    expect(r.skipHeader).toBe(true);
    expect(r.skipFooter).toBe(true);
    // Column headings and signature labels describe the results, not the lab.
    // Dropping them by default would make the report harder to read.
    expect(r.skipColumnHeaders).toBe(false);
    expect(r.skipSignatureLabels).toBe(false);
    expect(r.headerReserveMm).toBe(DEFAULT_HEADER_RESERVE_MM);
  });

  it("lets the footprint override each band", () => {
    const r = resolveLetterhead({
      ...BASE,
      defaultLayout: "ContentOnly",
      letterheadFootprint: {
        skipHeader: false,
        skipFooter: true,
        skipColumnHeaders: true,
        skipSignatureLabels: true,
      },
    });
    expect(r.skipHeader).toBe(false);
    expect(r.skipColumnHeaders).toBe(true);
    expect(r.skipSignatureLabels).toBe(true);
  });

  it("ignores a footprint while the layout is still FullPage", () => {
    const r = resolveLetterhead({
      ...BASE,
      letterheadFootprint: {
        skipHeader: true,
        skipFooter: true,
        skipColumnHeaders: true,
        skipSignatureLabels: true,
      },
    });
    expect(r.skipHeader).toBe(false);
    expect(r.skipFooter).toBe(false);
  });
});

describe("reserve validation", () => {
  it("accepts a reserve inside the page", () => {
    expect(validate({ ...BASE, letterheadReserveMm: 45 }).ok).toBe(true);
  });

  it("rejects a reserve that would push the results off the sheet", () => {
    const r = validate({ ...BASE, letterheadReserveMm: MAX_RESERVE_MM + 1 });
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe("letterheadReserveMm");
  });

  it("rejects a negative reserve", () => {
    expect(validate({ ...BASE, letterheadFooterReserveMm: -5 }).ok).toBe(false);
  });
});

describe("DefaultReportTemplate letterhead modes", () => {
  it("prints the lab's name and footer in FullPage", () => {
    const els = walk(DefaultReportTemplate({ data: sampleData, config: BASE }));
    const text = allText(els);
    expect(text).toContain(sampleData.lab.name.toUpperCase());
    expect(text).toContain("SUNDAY EVENING CLOSED");
  });

  it("omits the drawn letterhead and footer in ContentOnly", () => {
    const els = walk(
      DefaultReportTemplate({ data: sampleData, config: { ...BASE, defaultLayout: "ContentOnly" } }),
    );
    const text = allText(els);
    expect(text).not.toContain(sampleData.lab.name.toUpperCase());
    expect(text).not.toContain("SUNDAY EVENING CLOSED");
  });

  it("still prints the results in ContentOnly", () => {
    const els = walk(
      DefaultReportTemplate({ data: sampleData, config: { ...BASE, defaultLayout: "ContentOnly" } }),
    );
    expect(allText(els)).toContain(sampleData.patient.name);
  });

  // The regression that matters: without the reserve the results print on top
  // of the paper's own masthead.
  it("reserves the masthead space at the top of the page", () => {
    const els = walk(
      DefaultReportTemplate({
        data: sampleData,
        config: { ...BASE, defaultLayout: "ContentOnly", letterheadReserveMm: 50 },
      }),
    );
    expect(pageStyle(els).paddingTop).toBeCloseTo(mmToPt(50), 5);
  });

  it("leaves the normal top padding alone in FullPage", () => {
    const els = walk(DefaultReportTemplate({ data: sampleData, config: BASE }));
    expect(pageStyle(els).paddingTop).toBe(28);
  });
});

describe("GolmuriStandardTemplate letterhead modes", () => {
  it("draws the letterhead and footer in FullPage", () => {
    const names = componentNames(walk(GolmuriStandardTemplate({ data: sampleData, config: BASE })));
    expect(names).toContain("Letterhead");
    expect(names).toContain("Footer");
  });

  it("omits both in ContentOnly", () => {
    const names = componentNames(
      walk(GolmuriStandardTemplate({ data: sampleData, config: { ...BASE, defaultLayout: "ContentOnly" } })),
    );
    expect(names).not.toContain("Letterhead");
    expect(names).not.toContain("Footer");
  });

  it("reserves the masthead space at the top of the page", () => {
    const els = walk(
      GolmuriStandardTemplate({
        data: sampleData,
        config: { ...BASE, defaultLayout: "ContentOnly", letterheadReserveMm: 42 },
      }),
    );
    expect(pageStyle(els).paddingTop).toBeCloseTo(mmToPt(42), 5);
  });
});
