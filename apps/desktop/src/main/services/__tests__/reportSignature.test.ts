import { describe, it, expect } from "vitest";
import { signatureName } from "@/pdf/sections/LetterheadFooter";

/**
 * Who the report is signed by.
 *
 * The footer had "Dr. P. C. Dubey, M.D. (Patho)" written into it as a string
 * literal, while the letterhead above it read the pathologist from Settings.
 * So the two halves of the same page could disagree: change the pathologist in
 * Settings and every report still went out signed by the previous one. On a
 * document a doctor acts on, the signature is the part that must not be a guess.
 */
describe("signatureName", () => {
  it("uses the pathologist configured in Settings", () => {
    expect(
      signatureName({ pathologistName: "Dr. A. Kumar", pathologistQuals: "M.D. (Patho)" }),
    ).toBe("Dr. A. Kumar, M.D. (Patho)");
  });

  it("copes with a pathologist who has no qualifications recorded", () => {
    expect(signatureName({ pathologistName: "Dr. A. Kumar", pathologistQuals: null })).toBe(
      "Dr. A. Kumar",
    );
  });

  // The template editor offers a signature line; it was collected and ignored.
  it("prefers an explicit signature line from the template", () => {
    expect(
      signatureName(
        { pathologistName: "Dr. A. Kumar", pathologistQuals: "M.D." },
        "Dr. B. Singh, M.D. (Path)",
      ),
    ).toBe("Dr. B. Singh, M.D. (Path)");
  });

  it("ignores a signature line that is only whitespace", () => {
    expect(
      signatureName({ pathologistName: "Dr. A. Kumar", pathologistQuals: "M.D." }, "   "),
    ).toBe("Dr. A. Kumar, M.D.");
  });

  // Better a blank line the lab notices than someone else's name on their report.
  it("returns nothing when no pathologist has been set up yet", () => {
    expect(signatureName({ pathologistName: null, pathologistQuals: null })).toBe("");
  });
});
