/** Circle with the person's first initial — used when an account has no photo. */
export function initialAvatar(name: string | null | undefined): string {
  const letter = (name || '?').trim().charAt(0).toUpperCase() || '?';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96">` +
    `<rect width="96" height="96" rx="48" fill="#2b2b2b"/>` +
    `<text x="50%" y="50%" dy=".35em" text-anchor="middle" font-family="sans-serif" ` +
    `font-size="42" font-weight="600" fill="#ffffff">${letter.replace(/[<>&"]/g, '?')}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** The user's photo if they have one, otherwise an initial-letter circle. */
export function avatarOrInitial(url: string | null | undefined, name: string | null | undefined): string {
  return url && url.trim() ? url : initialAvatar(name);
}
