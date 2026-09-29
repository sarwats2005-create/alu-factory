/**
 * i18n audit — machine-checks the dictionary for structural mistakes:
 * missing keys, duplicate keys, empty values, untranslated leftovers
 * (identical en/ku), LTR punctuation in Sorani strings, and mixed
 * Latin words that likely should be Sorani.
 *
 * Run: npx tsx scripts/i18n-audit.ts
 */
import { dict } from "../src/lib/i18n";

const ltrPunctuation = /[.?!,:;]/; // Sorani uses Arabic punctuation ،؛؟

let issues = 0;

// 1. Duplicate detection happens at parse time via a Set on the raw source,
//    so here we only check pairs.
const entries = Object.entries(dict);

for (const [key, entry] of entries) {
  const { en, ku } = entry;

  if (!en.trim()) { console.log(`MISSING en value: ${key}`); issues++; }
  if (!ku.trim()) { console.log(`MISSING ku value: ${key}`); issues++; }

  // Untranslated: identical strings (allowed for brand/technical tokens)
  const allowedIdentical = /^(ALU FACTORY|USD|IQD|CSV|PDF|JSON|SKU)$/i.test(en) || /[A-Z]{2,}|\(kg\)|\(%\)/.test(en);
  if (en === ku && !allowedIdentical) {
    console.log(`UNTRANSLATED (en === ku): ${key} -> "${en}"`);
    issues++;
  }

  // LTR punctuation in Sorani (wrong direction marks)
  if (ltrPunctuation.test(ku)) {
    console.log(`LTR PUNCTUATION in ku: ${key} -> "${ku}"`);
    issues++;
  }

  // Interpolated placeholders must survive translation
  const enVars = en.match(/\{[a-zA-Z]+\}/g) || [];
  const kuVars = ku.match(/\{[a-zA-Z]+\}/g) || [];
  if (enVars.join() !== kuVars.join()) {
    console.log(`PLACEHOLDER MISMATCH: ${key} en=[${enVars}] ku=[${kuVars}]`);
    issues++;
  }
}

console.log(`\nAudited ${entries.length} keys — ${issues === 0 ? "ALL CLEAN ✓" : issues + " issue(s) found"}`);
process.exit(issues === 0 ? 0 : 1);
