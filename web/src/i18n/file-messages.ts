import type { PsdLoss } from '../model/psd-losses';

/** Canonical English for the dialog. Translate individual losses at render time. */
export function describeFileLosses(losses: PsdLoss[], format = 'PSD'): string {
  // Some loss labels already contain commas or conjunctions.
  const parts = (kind: PsdLoss['kind']) => losses.filter((loss) => loss.kind === kind).map((loss) => loss.label).join('; ');
  const flat = parts('flattened');
  const gone = parts('omitted');
  return [
    flat ? `${format} flattens ${flat} into pixels.` : '',
    gone ? `${format} leaves out ${gone}.` : '',
  ].filter(Boolean).join('\n');
}
