import { useLayoutEffect, useState } from 'react';

/**
 * Reports whether an element fits in the viewport below the sticky top bar.
 * Side panels are only made sticky when this is true: a sticky panel taller
 * than the viewport hides its own bottom until the neighbouring column ends,
 * which makes one column appear frozen while the other scrolls.
 */
export function useFitsViewport<T extends HTMLElement>() {
  const [element, setElement] = useState<T | null>(null);
  const [fits, setFits] = useState(false);
  useLayoutEffect(() => {
    if (!element) { setFits(false); return; }
    const measure = () => {
      const root = getComputedStyle(document.documentElement);
      const reserved = (parseFloat(root.scrollPaddingTop) || 0) + 16;
      setFits(element.offsetHeight <= window.innerHeight - reserved);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);
    return () => { observer.disconnect(); window.removeEventListener('resize', measure); };
  }, [element]);
  return [setElement, fits] as const;
}
