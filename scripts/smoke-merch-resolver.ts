import 'dotenv/config';
import { config } from 'dotenv';
config({ path: '.env.local' });

import { resolveMerchSelection, availableSizesFor, MERCH_VARIANT_MATRIX } from '../lib/cart/merch-config';
import { MERCH_PRICE_IDS } from '../lib/stripe-constants';

const missing = Object.entries(MERCH_PRICE_IDS).filter(([k, v]) => !v);
console.log(`MERCH_PRICE_IDS populated: ${20 - missing.length}/20`);
if (missing.length) console.log('Missing:', missing.map(([k]) => k));

const cases = [
  ['mujo-frother', undefined, undefined],
  ['mujo-hat', 'white', undefined],
  ['mujo-hat', 'stone', undefined],
  ['mujo-tee', 'desert', 'm'],
  ['mujo-tee', 'white', 'xl'],
  ['mujo-crew', 'bone', 's'],
  ['mujo-crew', 'bone', 'xs'],      // expect null (asymmetric)
  ['mujo-crew', 'sandstone', 'xs'],
] as const;

console.log('\nForward resolution:');
for (const [slug, color, size] of cases) {
  const r = resolveMerchSelection(slug as any, color as any, size as any);
  const tag = `${slug}/${color ?? '-'}/${size ?? '-'}`.padEnd(28);
  if (!r) {
    console.log(`  ${tag} → null (expected for crew/bone/xs)`);
  } else {
    console.log(`  ${tag} → ${r.stripePriceId.padEnd(34)} "${r.line.variantTitle}"`);
  }
}

console.log('\nAvailable sizes:');
console.log('  crew/bone     →', availableSizesFor('mujo-crew', 'bone'));
console.log('  crew/sandstone →', availableSizesFor('mujo-crew', 'sandstone'));
console.log('  tee/desert    →', availableSizesFor('mujo-tee', 'desert'));
console.log('  hat/white     →', availableSizesFor('mujo-hat', 'white'));
