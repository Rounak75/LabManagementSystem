// Where the lab actually is, for map links.
//
// The address is written for a person to read — it names Brown Bunch Bakery
// as the landmark — and handing that string to Google Maps as a search term
// opened the bakery instead of the lab. A search ranks whatever is indexed
// nearby; the lab has no listing to outrank it with.
//
// A Plus Code is a coordinate rather than a search term, so it resolves to the
// door. It lives here rather than in `lab_settings` because there is no column
// for it — move it there when the desktop grows a field to edit it, and this
// module becomes the fallback.

/** Google Plus Code for the Golmuri Chowk branch. */
export const LAB_PLUS_CODE = "Q6VF+MG2";

/** The locality a short Plus Code needs to be unambiguous. */
export const LAB_PLUS_CODE_AREA = "Golmuri, Jamshedpur, Jharkhand 831003";

/** A maps URL that lands on the lab itself. */
export function labMapsHref(): string {
  const query = `${LAB_PLUS_CODE} ${LAB_PLUS_CODE_AREA}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
