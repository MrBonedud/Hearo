import type { ReactNode } from 'react';
import { ArrowRight, BookOpen, CircleHelp, FolderClock, House, Mic, PlayCircle } from 'lucide-react';
import { Hearo } from '@/components/hearo';

export type AppPhase = 'setup' | 'session' | 'review';
export type NavKey = 'home' | 'learn' | 'practice' | 'saved';

export function TopBar({ onHome, phase, onLanding }: { onHome: () => void; phase: AppPhase; onLanding: boolean }) {
  const steps: Array<[AppPhase, string, string]> = [['setup', '01', 'Prepare'], ['session', '02', 'Explain'], ['review', '03', 'Reflect']];
  return <header className="topbar">
    <button className="brand" type="button" onClick={onHome} data-testid="button-home" aria-label="Hearo home">
      <Hearo pose="wave" size={40} className="brand-hearo" />
      <span className="brand-name">Hearo</span>
    </button>
    <div className="top-context">
      <ol className="top-steps" aria-label="Study steps">
        {steps.map(([key, number, label]) => <li key={key} className={!onLanding && phase === key ? 'is-current' : ''} aria-current={!onLanding && phase === key ? 'step' : undefined}>
          <span className="top-step-number">{number}</span><span className="top-step-label">{label}</span>
        </li>)}
      </ol>
      <span className="quiet-indicator"><span aria-hidden="true" /> No voice responses</span>
    </div>
    <button className="help-button" type="button" onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })} data-testid="button-how-it-works">
      <CircleHelp size={16} /><span>How it works</span>
    </button>
  </header>;
}

type NavItem = { key: NavKey; label: string; arabic: string; icon: ReactNode; onSelect: () => void; disabled?: boolean; hint?: string };

export function SideNav({ active, studyOpen, onHome, onLearn, onPractice, onSaved }: {
  active: NavKey; studyOpen: boolean;
  onHome: () => void; onLearn: () => void; onPractice: () => void; onSaved: () => void;
}) {
  const leaveFirst = 'Leave the open study first (Home or Change source)';
  const items: NavItem[] = [
    { key: 'home', label: 'Home', arabic: 'الرئيسية', icon: <House size={19} />, onSelect: onHome },
    { key: 'learn', label: 'Learn', arabic: 'تعلّم', icon: <BookOpen size={19} />, onSelect: onLearn },
    { key: 'practice', label: 'Practice', arabic: 'تدرّب', icon: <PlayCircle size={19} />, onSelect: onPractice, disabled: studyOpen, hint: studyOpen ? leaveFirst : 'Guided offline sample' },
    { key: 'saved', label: 'Saved studies', arabic: 'دراساتك', icon: <FolderClock size={19} />, onSelect: onSaved, disabled: studyOpen, hint: studyOpen ? leaveFirst : 'Drafts and reports in this browser' },
  ];
  return <nav className="sidebar" aria-label="Main navigation">
    <ul className="nav-list">
      {items.map(item => <li key={item.key}>
        <button type="button" className={`nav-item ${active === item.key ? 'is-active' : ''}`} aria-current={active === item.key ? 'page' : undefined}
          onClick={item.onSelect} disabled={item.disabled} title={item.hint ?? item.label} data-testid={`nav-${item.key}`}>
          <span className="nav-icon" aria-hidden="true">{item.icon}</span>
          <span className="nav-label">{item.label}<small lang="ar" dir="rtl">{item.arabic}</small></span>
        </button>
      </li>)}
    </ul>
    <div className="sidebar-foot">
      <div className="sidebar-note"><Mic size={15} aria-hidden="true" /><p><strong>Silent mode</strong> Hearo listens and checks quietly. It never speaks back.</p></div>
      {active !== 'learn' && <button type="button" className="primary-button sidebar-cta" onClick={onLearn} data-testid="nav-cta-start">Start a live study <ArrowRight size={15} /></button>}
    </div>
  </nav>;
}
