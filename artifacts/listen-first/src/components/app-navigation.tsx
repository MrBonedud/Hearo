import type { ReactNode } from 'react';
import { ArrowRight, BookOpen, CircleHelp, FolderClock, House, Mic, PlayCircle } from 'lucide-react';
import { Hearo } from '@/components/hearo';
import { LanguageSwitcher } from '@/components/language-switcher';
import type { TranslationKey } from '@/i18n/translations';
import { useTranslation } from '@/i18n/useTranslation';

export type AppPhase = 'setup' | 'session' | 'review';
export type NavKey = 'home' | 'learn' | 'practice' | 'saved';

const STEPS: Array<[AppPhase, string, TranslationKey]> = [['setup', '01', 'steps.prepare'], ['session', '02', 'steps.explain'], ['review', '03', 'steps.reflect']];

export function TopBar({ onHome, phase, onLanding }: { onHome: () => void; phase: AppPhase; onLanding: boolean }) {
  const { t } = useTranslation();
  return <header className="topbar">
    <button className="brand" type="button" onClick={onHome} data-testid="button-home" aria-label={t('nav.brandHome')}>
      <Hearo pose="wave" size={40} className="brand-hearo" />
      <span className="brand-name" lang="en" dir="ltr">Hearo</span>
    </button>
    <div className="top-context">
      <ol className="top-steps" aria-label={t('steps.label')}>
        {STEPS.map(([key, number, label]) => <li key={key} className={!onLanding && phase === key ? 'is-current' : ''} aria-current={!onLanding && phase === key ? 'step' : undefined}>
          <span className="top-step-number">{number}</span><span className="top-step-label">{t(label)}</span>
        </li>)}
      </ol>
      <span className="quiet-indicator"><span aria-hidden="true" /> {t('nav.quiet')}</span>
    </div>
    <div className="topbar-actions">
      <button className="help-button" type="button" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })} data-testid="button-how-it-works">
        <CircleHelp size={16} aria-hidden="true" /><span>{t('nav.howItWorks')}</span>
      </button>
      <LanguageSwitcher />
    </div>
  </header>;
}

type NavItem = { key: NavKey; label: TranslationKey; icon: ReactNode; onSelect: () => void; disabled?: boolean; hint?: TranslationKey };

export function SideNav({ active, studyOpen, onHome, onLearn, onPractice, onSaved }: {
  active: NavKey; studyOpen: boolean;
  onHome: () => void; onLearn: () => void; onPractice: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const items: NavItem[] = [
    { key: 'home', label: 'nav.home', icon: <House size={20} />, onSelect: onHome },
    { key: 'learn', label: 'nav.learn', icon: <BookOpen size={20} />, onSelect: onLearn },
    { key: 'practice', label: 'nav.practice', icon: <PlayCircle size={20} />, onSelect: onPractice, disabled: studyOpen, hint: studyOpen ? 'nav.leaveFirst' : 'nav.practiceHint' },
    { key: 'saved', label: 'nav.saved', icon: <FolderClock size={20} />, onSelect: onSaved, disabled: studyOpen, hint: studyOpen ? 'nav.leaveFirst' : 'nav.savedHint' },
  ];
  return <nav className="sidebar" aria-label={t('nav.main')}>
    <ul className="nav-list">
      {items.map(item => <li key={item.key}>
        <button type="button" className={`nav-item ${active === item.key ? 'is-active' : ''}`} aria-current={active === item.key ? 'page' : undefined}
          onClick={item.onSelect} disabled={item.disabled} title={t(item.hint ?? item.label)} data-testid={`nav-${item.key}`}>
          <span className="nav-icon" aria-hidden="true">{item.icon}</span>
          <span className="nav-label">{t(item.label)}</span>
        </button>
      </li>)}
    </ul>
    <div className="sidebar-foot">
      <div className="sidebar-note"><Mic size={16} aria-hidden="true" /><p><strong>{t('nav.silentTitle')}</strong> {t('nav.silentBody')}</p></div>
      {active !== 'learn' && <button type="button" className="primary-button sidebar-cta" onClick={onLearn} data-testid="nav-cta-start">{t('common.startLiveStudy')} <ArrowRight size={16} aria-hidden="true" /></button>}
    </div>
  </nav>;
}
