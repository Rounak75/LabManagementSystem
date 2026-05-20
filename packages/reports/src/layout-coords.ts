// Phase 3d Plan A — measured positions for report elements on A4.
// FullPage and ContentOnly use IDENTICAL coordinates for everything that
// appears in both. Only the surrounding decorations toggle. Plan B's
// per-printer calibration nudges these via x/y offsets.

export const PAGE_WIDTH_MM = 210;
export const PAGE_HEIGHT_MM = 297;

// Decorations (FullPage only)
export const HEADER_BAND = { topMm: 0, heightMm: 28 } as const;
export const FOOTER_BAND = { topMm: 270, heightMm: 27 } as const;
export const COLUMN_HEADERS = { topMm: 55, heightMm: 6 } as const;
export const SIGNATURE_LABELS = { topMm: 248, heightMm: 12 } as const;

// Content (BOTH FullPage and ContentOnly)
export const PATIENT_INFO_ROW = {
  topMm: 38,
  heightMm: 14,
  nameXMm: 18,
  ageXMm: 110,
  sexXMm: 145,
  dateXMm: 165,
  referredByTopMm: 49,
} as const;

export const TEST_SECTIONS_TABLE = {
  topMm: 64,
  rowHeightMm: 5,
  leftMarginMm: 18,
  valueXMm: 90,
  unitXMm: 125,
  rangeXMm: 155,
} as const;

// AlignmentTest crosshair positions (must mirror content coords above).
export const ALIGNMENT_CROSSHAIRS = [
  { label: "Name",          xMm: PATIENT_INFO_ROW.nameXMm, yMm: PATIENT_INFO_ROW.topMm },
  { label: "Age",           xMm: PATIENT_INFO_ROW.ageXMm,  yMm: PATIENT_INFO_ROW.topMm },
  { label: "Date",          xMm: PATIENT_INFO_ROW.dateXMm, yMm: PATIENT_INFO_ROW.topMm },
  { label: "First test row",xMm: TEST_SECTIONS_TABLE.leftMarginMm, yMm: TEST_SECTIONS_TABLE.topMm + 5 },
  { label: "Value column",  xMm: TEST_SECTIONS_TABLE.valueXMm,     yMm: TEST_SECTIONS_TABLE.topMm + 5 },
  { label: "Units column",  xMm: TEST_SECTIONS_TABLE.unitXMm,      yMm: TEST_SECTIONS_TABLE.topMm + 5 },
] as const;

export const mm = (v: number) => `${v}mm`;
