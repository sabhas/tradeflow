/** Round monetary/quantity strings using the same modes as company settings. */
export function roundAmountString(input: string, decimals: number, mode: string): string {
  const n = parseFloat(input || '0');
  if (!Number.isFinite(n)) return formatFixed(0, decimals);
  const factor = 10 ** decimals;
  const scaled = n * factor;
  let r: number;
  switch (mode) {
    case 'half_down': {
      const f = Math.floor(scaled);
      const frac = scaled - f;
      if (frac < 0.5) r = f;
      else if (frac > 0.5) r = Math.ceil(scaled);
      else r = f;
      break;
    }
    case 'down':
      r = Math.floor(scaled);
      break;
    case 'up':
      r = Math.ceil(scaled);
      break;
    case 'half_up':
    default:
      r = Math.round(scaled);
      break;
  }
  return formatFixed(r / factor, decimals);
}

function formatFixed(n: number, decimals: number): string {
  return n.toFixed(decimals);
}
