// Backfills Product.gender for rows where Category was mistakenly used to
// store a gender/age word ("Men"/"Women"/"Kids"/etc.) — Category should only
// ever describe WHAT the product is; Gender describes WHO it's for. This is
// strictly additive: it only ever sets `gender` when the field is currently
// empty/null/'Unisex' (the default), and it NEVER touches `category`, `name`,
// or any other field — the shopkeeper's original category text is preserved
// exactly, just no longer offered as a category *suggestion* (see the
// isGenderOnlyLabel() fix in lib/businessConfig.ts + lib/useCategories.ts).
//
// Usage: node scratch/backfill-gender-from-category.js         (dry run, default)
//        node scratch/backfill-gender-from-category.js --apply  (writes changes)
const fs = require('fs');
const { PrismaClient } = require('@prisma/client');

const envLocal = fs.readFileSync('.env.local', 'utf8');
const getEnv = (key) => {
  const m = envLocal.match(new RegExp(`^${key}=(.*)$`, 'm'));
  if (!m) return undefined;
  let v = m[1].replace(/\r$/, '').trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  return v;
};
process.env.DATABASE_URL = getEnv('DATABASE_URL');
const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');

// Same normalization the app's Gender select actually offers: Unisex / Men / Women / Boys / Girls / Kids.
const GENDER_MAP = {
  men: 'Men', mens: 'Men', "men's": 'Men', male: 'Men', gents: 'Men', gentlemen: 'Men',
  women: 'Women', womens: 'Women', "women's": 'Women', ladies: 'Women', female: 'Women',
  boys: 'Boys', boy: 'Boys',
  girls: 'Girls', girl: 'Girls',
  kids: 'Kids', kid: 'Kids', baby: 'Kids', babies: 'Kids', infant: 'Kids', toddler: 'Kids',
  unisex: 'Unisex',
};

// Cross-check the product NAME for its own gender/age signal, so a Category
// value that's not just unhelpful but actively WRONG (e.g. a product named
// "Women's Jacket" filed under category "Men") never gets trusted blindly —
// that would plant a wrong Gender value, which is worse than leaving it
// unset. Word-boundary match, same reasoning as businessConfig.ts's own
// detectGenderSignal — "Women's" must not match as "Men" via substring.
const NAME_SIGNAL_PATTERNS = [
  { re: /\b(kids?|baby|babies|infant|toddler)\b/i, group: 'Kids' },
  { re: /\bboys?\b/i, group: 'Boys' },
  { re: /\bgirls?\b/i, group: 'Girls' },
  { re: /\b(women|womens|women's|ladies|female)\b/i, group: 'Women' },
  { re: /\b(men|mens|men's|male|gents|gentlemen)\b/i, group: 'Men' },
];
function nameSignal(name) {
  for (const { re, group } of NAME_SIGNAL_PATTERNS) {
    if (re.test(name || '')) return group;
  }
  return null;
}

// Boys/Girls are more specific members of the same "kids" family, not a
// contradiction of a generic "Kids" category mapping — "Boys Jeans" should
// resolve to the more specific gender="Boys", not get skipped as conflicting.
// A real conflict is only across families (Men vs Women, either vs Kids-family).
const FAMILY = { Men: 'men', Women: 'women', Kids: 'kids', Boys: 'kids', Girls: 'kids' };
function resolveGender(categoryMapped, nameSig) {
  if (!nameSig) return { value: categoryMapped, conflict: false };
  if (FAMILY[nameSig] !== FAMILY[categoryMapped]) return { value: null, conflict: true };
  // Same family — prefer whichever is more specific than plain "Kids".
  const value = nameSig !== 'Kids' ? nameSig : categoryMapped;
  return { value, conflict: false };
}

(async () => {
  const products = await prisma.product.findMany({
    select: { id: true, name: true, category: true, gender: true, shopId: true },
  });

  const toApply = [];
  const conflicts = [];

  for (const p of products) {
    const key = (p.category || '').trim().toLowerCase();
    const mapped = GENDER_MAP[key];
    if (!mapped) continue;
    const hasRealGender = p.gender && p.gender !== 'Unisex';
    if (hasRealGender) continue; // never overwrite an already-meaningful Gender value

    const sig = nameSignal(p.name);
    const resolved = resolveGender(mapped, sig);
    if (resolved.conflict) {
      conflicts.push({ ...p, mappedGender: mapped, nameSays: sig });
    } else {
      toApply.push({ ...p, mappedGender: resolved.value });
    }
  }

  console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} — ${toApply.length} product(s) to backfill, ${conflicts.length} skipped as conflicting (of ${products.length} total).`);
  for (const c of toApply) {
    console.log(`  OK      [${c.shopId}] "${c.name}" — category="${c.category}" gender=${JSON.stringify(c.gender)} -> gender="${c.mappedGender}"`);
  }
  if (conflicts.length > 0) {
    console.log('\nSkipped — product name disagrees with the category-derived gender (needs a human, not a script):');
    for (const c of conflicts) {
      console.log(`  CONFLICT [${c.shopId}] "${c.name}" — category="${c.category}" would map to "${c.mappedGender}", but the name says "${c.nameSays}". Left untouched.`);
    }
  }

  if (APPLY && toApply.length > 0) {
    let updated = 0;
    for (const c of toApply) {
      await prisma.product.update({ where: { id: c.id }, data: { gender: c.mappedGender } });
      updated++;
    }
    console.log(`\nUpdated ${updated} product(s). category left untouched on all of them (including the ${conflicts.length} conflicting ones, which got no changes at all).`);
  } else if (!APPLY) {
    console.log('\nDry run only — no changes written. Re-run with --apply to write.');
  }

  await prisma.$disconnect();
})().catch(async (e) => { console.error('SCRIPT ERROR:', e); await prisma.$disconnect(); process.exit(1); });
