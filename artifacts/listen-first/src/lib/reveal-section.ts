/**
 * Scroll an in-page section into view and move keyboard focus to it, so the
 * jump is announced and the next Tab continues from that section. The target
 * needs tabIndex={-1}. Returns false when the section is not on this screen.
 */
export function revealSection(id: string): boolean {
  const target = document.getElementById(id);
  if (!target) return false;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  target.focus({ preventScroll: true });
  return true;
}
