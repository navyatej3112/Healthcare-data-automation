// Light title-case helper.
//
// CMS returns text in ALL CAPS (e.g. "KENDALL LAKES HEALTHCARE AND REHAB CENTER",
// "5280 SW 157 AVENUE"); the report target is title case. This is intentionally
// "light": it capitalizes words, lowercases minor joining words, and preserves a
// small exceptions list so tokens like LLC, SW, NE, II, etc. aren't mangled.
// It does NOT abbreviate or convert ordinals (e.g. "157 AVENUE" -> "157 Avenue",
// not "157th Ave") — that cosmetic level isn't required and the sample is stale.

// Tokens that must stay fully uppercase.
const UPPERCASE_EXCEPTIONS = new Set([
  // Entity suffixes
  "LLC", "LLP", "L.L.C.", "INC", "INC.", "LTD", "PLLC", "PC", "CO", "CORP",
  // Compass directions (street addresses)
  "N", "S", "E", "W", "NE", "NW", "SE", "SW",
  // Misc
  "US", "USA", "HVAC",
  // Roman numerals
  "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII",
]);

// Minor words lowercased unless they are the first token.
const MINOR_WORDS = new Set([
  "a", "an", "and", "or", "of", "the", "for", "to", "at", "in", "on", "by", "&",
]);

function titleCaseToken(token: string): string {
  if (!token) return token;
  // Capitalize first letter, lowercase the rest. Works for "AVENUE" -> "Avenue"
  // and "157TH" -> "157th" (leading digit unchanged, trailing letters lowered).
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

export function titleCase(input: string | null | undefined): string {
  if (!input) return "";
  return input
    .trim()
    .split(/\s+/)
    .map((word, i) => {
      // Strip surrounding punctuation for matching, but keep it in the output.
      const bare = word.replace(/[^A-Za-z.&]/g, "");
      const upper = bare.toUpperCase();

      if (UPPERCASE_EXCEPTIONS.has(upper)) return word.toUpperCase();
      if (i > 0 && MINOR_WORDS.has(bare.toLowerCase())) return word.toLowerCase();
      return titleCaseToken(word);
    })
    .join(" ");
}
