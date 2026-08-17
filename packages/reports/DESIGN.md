---
name: Golmuri Janch Ghar — Printed Report
description: The A4 sheet a patient carries home and a referring doctor reads — designed for a black-and-white printer, not a screen.
colors:
  ink: "#000000"
  section-bar: "#1e293b"
  section-bar-fg: "#ffffff"
  rule: "#cbd5e1"
  grid-head: "#f1f5f9"
  secondary-ink: "#475569"
  body-ink: "#1f2937"
  abnormal: "#b91c1c"
  accent-default: "#0f766e"
typography:
  lab-name:
    fontFamily: "Helvetica"
    fontSize: "16pt"
    fontWeight: 700
  pathologist:
    fontFamily: "Helvetica"
    fontSize: "11pt"
    fontWeight: 700
  section-title:
    fontFamily: "Helvetica"
    fontSize: "10pt"
    fontWeight: 700
  body:
    fontFamily: "Helvetica"
    fontSize: "9pt"
  subhead:
    fontFamily: "Helvetica"
    fontSize: "9pt"
    fontWeight: 700
  fine:
    fontFamily: "Helvetica"
    fontSize: "8pt"
  legend:
    fontFamily: "Helvetica"
    fontSize: "7pt"
spacing:
  page-width: "210mm"
  page-height: "297mm"
  left-margin: "18mm"
  row-height: "5mm"
  page-padding-x: "32pt"
components:
  section-bar:
    backgroundColor: "{colors.section-bar}"
    textColor: "{colors.section-bar-fg}"
    typography: "{typography.section-title}"
    padding: "3pt"
  result-row:
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    height: "5mm"
  result-row-abnormal:
    textColor: "{colors.abnormal}"
    typography: "{typography.subhead}"
  grid-header:
    backgroundColor: "{colors.grid-head}"
    typography: "{typography.fine}"
    padding: "2pt"
  letterhead:
    textColor: "{colors.ink}"
    typography: "{typography.lab-name}"
  page-footer:
    textColor: "{colors.secondary-ink}"
    typography: "{typography.fine}"
---

# Design System: Golmuri Janch Ghar — Printed Report

## Overview

**Creative North Star: "The Black-and-White Record"**

This is the only artifact in the system that leaves the building. A patient carries it home in a bag; a referring doctor reads it in a different clinic; it may be photocopied, faxed, or filed for years. It is also, almost always, printed on a black-and-white laser printer. Every rule here follows from that one fact.

The governing consequence is that **colour cannot be the only carrier of meaning**. An out-of-range result used to be distinguished by red text alone — which meant that on the paper a patient was actually handed, a dangerously high value looked exactly like a normal one. So every abnormal result now prints a letter beside it: `H` above range, `L` below, `*` when the result is qualitative and no numeric range applies. The red stays for the rare colour print; the letter is what actually does the work.

The second governing fact is that this page has to land accurately on paper the lab may have pre-printed. Positions are therefore not a consequence of flow — they are **measured absolute millimetres on A4**, declared in one coordinate file, with a printable crosshair sheet that mirrors those exact coordinates so a printer can be calibrated against a real sheet. The invariant that makes the whole scheme work: content coordinates are **identical** whether the letterhead is drawn or the paper already carries it. Only the decorations toggle.

The visual register is plain to the point of severity. There is no radius anywhere, no shadow, no illustration, and one typeface. A lab report is not a place to have a point of view about typography; it is a place where a number has to be unambiguous eighteen months later.

**Key Characteristics:**
- Meaning never depends on colour — every abnormal value carries a letter
- Absolute millimetre coordinates on A4, not flowed layout
- Content positions identical in FullPage and ContentOnly; only decorations toggle
- One typeface, a 7–16pt scale, no radius and no shadow
- A reversed dark bar is the only heavy element on the page
- Every page carries "Page N of M", so a missing sheet is detectable

## Colors

Near-monochrome by intent. Two colours carry meaning; everything else is ink and paper.

### Primary
- **Ink** (`#000000`): Results, labels, everything that must be legible after a photocopy.
- **Section Bar** (`#1e293b` with white text): The reversed band naming each department — Biochemistry, Haematology, Serology. The only heavy element on the sheet, and the thing that makes a dense page scannable.

### Secondary
- **Abnormal Red** (`#b91c1c`): Out-of-range values, and the pathologist's name in the letterhead. **Never the sole signal** — see the Ink-First Rule.
- **Accent** (`#0f766e` default, per-template configurable): The `DefaultReportTemplate` only, where it tints the letterhead rule, the lab name, and the abnormal marker dot. Templates may override it; the Golmuri standard template does not use it.

### Neutral
- **Body Ink** (`#1f2937`): Reference ranges and secondary values.
- **Secondary Ink** (`#475569`): Addresses, footers, legends, column labels — anything subordinate.
- **Rule** (`#cbd5e1`): The 0.5pt hairline under each result row.
- **Grid Head** (`#f1f5f9`): The fill behind a culture/sensitivity table header. Light enough to survive a toner-saving printer.

### Named Rules

**The Ink-First Rule.** Colour may reinforce a signal but must never be the only one carrying it. Anything printed in red also prints a letter, a word, or a mark that survives a monochrome printer, a photocopier and a fax. `abnormalFlag()` is the implementation; the rule is broader than that function.

**The Two-Colour Ceiling.** The sheet uses one reversed dark bar and one alert red. A third colour is a request to justify itself against a printer that will render it as grey.

## Typography

**Display Font:** Helvetica (with Arial fallback)
**Body Font:** Helvetica (with Arial fallback)
**Label/Mono Font:** Times-Roman (selectable per template, mapped from the editor's Times and Georgia choices)

Both faces are react-pdf built-ins — no download, no embedding risk.

**Character:** One face doing every job, separated by size and weight alone. The scale is compressed — 7, 8, 9, 10, 11, 16pt — because an A4 sheet holding a full panel of results has no room for generous steps, and a report that runs to two pages when it could run to one is a worse report.

Helvetica is used rather than a chosen brand face on purpose: it ships inside the PDF renderer, so a report is byte-identical on the lab PC, on the cloud portal download, and on a machine that has never seen the lab's fonts. An embedded webfont is a way for a report to render differently for the person who most needs to read it.

### Hierarchy
- **Lab Name** (700, 16pt): The letterhead. Largest thing on the page by a wide margin.
- **Pathologist** (700, 11pt, red): The signing doctor, top right.
- **Section Title** (700, 10pt, reversed, centred): The department bar.
- **Body** (9pt): Every result, label, value and range. The workhorse.
- **Subhead** (700, 9pt): A test name above its parameters, and abnormal values.
- **Fine** (8pt): Address lines, grid cells, footers, the portal sign-in strip.
- **Legend** (7pt, italic): The note under a culture table. The smallest type permitted.

### Named Rules

**The Nothing-Below-7pt Rule.** 7pt italic is the floor, and only for a legend. A patient reading their own report is frequently older than the person who designed it.

**The Ships-With-The-Renderer Rule.** Report typefaces come from react-pdf's built-ins. Do not embed a webfont: a report must render identically on the lab PC and in a patient's browser download.

## Layout

An A4 page, 210 × 297mm, with `32pt` horizontal padding and a left content margin at `18mm`.

The measured grid lives in one file, `layout-coords.ts`, and is the authority:

| Element | Position |
|---|---|
| Header band | 0–28mm (decoration) |
| Patient info row | 38mm (name 18mm, age 110mm, sex 145mm, date 165mm) |
| Referred-by line | 49mm |
| Column headers | 55mm (decoration) |
| Results table | from 64mm, 5mm per row |
| — value / unit / range columns | 90mm / 125mm / 155mm |
| Signature labels | 248mm (decoration) |
| Footer band | 270–297mm (decoration) |

Sections take `wrap={false}` so a department is never split across a page boundary mid-table. The footer is `fixed`, so "Page N of M" appears on every sheet of a multi-page report.

### Named Rules

**The Identical-Coordinates Rule.** FullPage and ContentOnly place every piece of *content* at exactly the same millimetre. Only the four decorations — header band, column headers, signature labels, footer band — toggle. This is what lets one calibration serve both, and what makes the alignment-test crosshairs meaningful: they are drawn from the same constants the content uses.

**The Reserve-Don't-Reflow Rule.** When the paper carries its own letterhead, the space it occupies is left *blank* rather than reclaimed. Dropping the header and letting results flow upward is the failure mode this design exists to prevent — the results would print on top of the lab's pre-printed masthead.

## Elevation & Depth

There is none, and that is a decision rather than an omission. Paper has no z-axis: a drop shadow costs toner, muddies a photocopy, and communicates nothing. Separation is done entirely with rules and fills — a 0.5pt hairline under each result row, a 1pt rule under the letterhead, a reversed bar for a section, and a pale fill behind a grid header.

## Shapes

No radius anywhere. Every bar, rule, table cell and band is square, because a rounded corner on a monochrome laser print reads as a printing artefact rather than a design choice.

Rules are hairlines: 0.5pt between result rows and around grid cells, 1pt under the letterhead and the patient bar. The abnormal marker in the default template is the one round form on the sheet — a 6pt dot — and it is always accompanied by its letter.

## Components

### Letterhead
Logo (60 × 60pt, optional) beside the lab name at 16pt bold, address and phone at 8pt in secondary ink, with the pathologist's name and qualifications right-aligned in red. Sits above a 1pt rule. Suppressed entirely in ContentOnly.

### Patient Bar
A single flex row: patient name, ID, age/sex, referring doctor, date — 9pt, space-between, above a 1pt rule. Prints in both layout modes; its coordinates never move.

### Section Bar
The reversed department heading: `#1e293b` fill, white 10pt bold, centred, 3pt padding, 10pt of clearance beneath. On a page carrying four departments this is the only navigation the reader gets.

### Result Row
`flex 2 / 1 / 2` — name, value, reference range — under a 0.5pt hairline with 2pt vertical padding. Abnormal values switch to red **and** bold **and** gain their `H`/`L`/`*` letter. Test names with a single parameter collapse to one line rather than printing a redundant heading.

### Grid Table
For culture and sensitivity results: an 8pt table with a `#f1f5f9` header row, a bold left label column at `flex 2`, and centred `flex 1` value cells, closed by a 7pt italic legend.

### Page Footer
Fixed to the bottom of every page: "Lab Technician" left, "Page N of M" centre, the resolved signature name right, all 8pt secondary ink. The signature resolves explicit template line → Settings pathologist → **blank**; a blank the lab will notice is better than the previous doctor's name under a diagnosis.

### Portal Sign-In Strip
An 8pt block above a 0.5pt rule telling the patient how to reach their report online. It exists because the lab prints no receipts: this strip is the only written record of their patient ID a patient ever receives.

### Alignment Crosshairs
A calibration-only page drawing crosshairs at six of the content coordinates — name, age, date, first test row, value column, units column. Printed on plain paper and held under a real pre-printed sheet, it turns letterhead alignment into a measurement instead of a guess.

## Do's and Don'ts

### Do:
- **Do** pair every colour signal with a mark that survives monochrome printing.
- **Do** take positions from `layout-coords.ts` rather than measuring by eye or relying on flow.
- **Do** keep content coordinates identical across FullPage and ContentOnly.
- **Do** use `wrap={false}` on a department section so it is never split mid-table.
- **Do** leave pre-printed space blank rather than reflowing into it.
- **Do** let the signature go blank when no pathologist is set.
- **Do** keep every typeface to react-pdf's built-ins.

### Don't:
- **Don't** signal anything by colour alone — the lab prints in black and white.
- **Don't** add a shadow, a gradient, or a rounded corner. Paper has no z-axis.
- **Don't** go below 7pt, and only a legend goes that small.
- **Don't** introduce a third meaningful colour beyond the section bar and abnormal red.
- **Don't** embed a webfont.
- **Don't** hard-code a doctor's name, a lab address, or opening hours — they come from Settings so one edit updates every future report.
- **Don't** let a report grow to two pages for want of tightening; a second sheet is a real cost to a lab printing hundreds.
