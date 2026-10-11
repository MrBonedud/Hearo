import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, Globe } from 'lucide-react';
import type { Language } from '@/i18n/translations';
import { useTranslation } from '@/i18n/useTranslation';

// Each option is written in its own language so it is recognisable from either interface.
const OPTIONS: Array<{ value: Language; name: string; short: string; dir: 'rtl' | 'ltr' }> = [
  { value: 'ar', name: 'العربية', short: 'ع', dir: 'rtl' },
  { value: 'en', name: 'English', short: 'EN', dir: 'ltr' },
];

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const menuId = useId();
  const current = OPTIONS.find(option => option.value === language) ?? OPTIONS[0];

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    // Focus the selected language when the menu opens.
    itemRefs.current[OPTIONS.findIndex(option => option.value === language)]?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, language]);

  const choose = (value: Language) => {
    setLanguage(value);
    close(true);
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = itemRefs.current.filter((item): item is HTMLButtonElement => Boolean(item));
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const focusAt = (next: number) => items[(next + items.length) % items.length]?.focus();
    if (event.key === 'Escape') { event.preventDefault(); close(true); }
    else if (event.key === 'ArrowDown') { event.preventDefault(); focusAt(index + 1); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); focusAt(index - 1); }
    else if (event.key === 'Home') { event.preventDefault(); focusAt(0); }
    else if (event.key === 'End') { event.preventDefault(); focusAt(items.length - 1); }
    else if (event.key === 'Tab') setOpen(false);
  };

  return <div className="lang-switcher" ref={rootRef}>
    <button
      ref={triggerRef}
      type="button"
      className="lang-trigger"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-controls={menuId}
      aria-label={t('lang.trigger', { current: current.name })}
      onClick={() => setOpen(value => !value)}
      onKeyDown={event => { if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); } }}
      data-testid="button-language"
    >
      <Globe size={16} aria-hidden="true" />
      <span className="lang-trigger-name" lang={current.value} dir={current.dir}>{current.name}</span>
      <span className="lang-trigger-short" lang={current.value} dir={current.dir} aria-hidden="true">{current.short}</span>
      <ChevronDown size={14} className="lang-trigger-chevron" aria-hidden="true" />
    </button>
    <div id={menuId} role="menu" aria-label={t('lang.menu')} className={`lang-menu ${open ? 'is-open' : ''}`} hidden={!open} onKeyDown={onMenuKeyDown}>
      {OPTIONS.map((option, index) => <button
        key={option.value}
        ref={node => { itemRefs.current[index] = node; }}
        type="button"
        role="menuitemradio"
        aria-checked={option.value === language}
        tabIndex={-1}
        className="lang-option"
        onClick={() => choose(option.value)}
        data-testid={`option-language-${option.value}`}
      >
        <span lang={option.value} dir={option.dir}>{option.name}</span>
        {option.value === language && <Check size={15} aria-hidden="true" />}
      </button>)}
    </div>
  </div>;
}
