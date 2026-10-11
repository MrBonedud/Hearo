import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, AudioLines, BookOpenCheck, LockKeyhole, Network } from 'lucide-react';
import { Hearo } from '@/components/hearo';
import { useTranslation } from '@/i18n/useTranslation';

const features = [
  { Icon: AudioLines, title: 'landing.feature1Title', body: 'landing.feature1Body' },
  { Icon: BookOpenCheck, title: 'landing.feature2Title', body: 'landing.feature2Body' },
  { Icon: Network, title: 'landing.feature3Title', body: 'landing.feature3Body' },
] as const;

const steps = [
  { title: 'landing.step1Title', body: 'landing.step1Body' },
  { title: 'landing.step2Title', body: 'landing.step2Body' },
  { title: 'landing.step3Title', body: 'landing.step3Body' },
] as const;

export function LandingExperience({ onLive, onSample }: { onLive: () => void; onSample: () => void }) {
  const reduced = useReducedMotion();
  const { t } = useTranslation();
  const fadeIn = (delay: number) => ({
    initial: { opacity: 0, y: reduced ? 0 : 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduced ? 0 : 0.3, delay: reduced ? 0 : delay, ease: 'easeOut' as const },
  });
  return <section className="landing" data-testid="screen-landing">
    <div className="landing-hero">
      <div className="hero-copy">
        <motion.div className="hero-kicker" {...fadeIn(0)}>{t('landing.kicker')}</motion.div>
        <motion.h1 className="hero-title" tabIndex={-1} {...fadeIn(0.05)}>
          <span className="line">{t('landing.titleLine1')}</span>
          <span className="line"><em>{t('landing.titleLine2')}</em></span>
        </motion.h1>
        <motion.p className="hero-description" {...fadeIn(0.1)}>{t('landing.description')}</motion.p>
        <motion.div className="hero-actions" {...fadeIn(0.2)}>
          <button className="primary-button" type="button" onClick={onLive} data-testid="button-start-live">
            {t('common.startLiveStudy')} <ArrowRight size={16} aria-hidden="true" />
          </button>
          <button className="secondary-button" type="button" onClick={onSample} data-testid="button-start-sample">
            {t('landing.trySample')}
          </button>
        </motion.div>
        <motion.p className="hero-caption" {...fadeIn(0.15)}>{t('landing.caption')}</motion.p>
      </div>
      <div className="hero-art">
        <Hearo pose="thumbsup" size={280} floating glow />
      </div>
    </div>

    <section className="landing-features" aria-labelledby="landing-features-heading">
      <h2 id="landing-features-heading" className="visually-hidden">{t('landing.featuresHeading')}</h2>
      <div className="feature-grid">
        {features.map(({ Icon, title, body }, index) => <motion.article className="feature-card" key={title} {...fadeIn(0.2 + index * 0.05)}>
          <span className="feature-icon" aria-hidden="true"><Icon size={20} /></span>
          <h3>{t(title)}</h3>
          <p>{t(body)}</p>
        </motion.article>)}
      </div>
    </section>

    <section className="landing-story" id="how-it-works" tabIndex={-1} aria-labelledby="how-heading">
      <div className="story-head">
        <span className="hero-kicker">{t('landing.howKicker')}</span>
        <h2 id="how-heading">{t('landing.howHeading')}</h2>
      </div>
      <ol className="story-grid">
        {steps.map((step, index) => <motion.li className="story-card" key={step.title} {...fadeIn(0.2 + index * 0.05)}>
          <span className="story-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
          <h3>{t(step.title)}</h3>
          <p>{t(step.body)}</p>
        </motion.li>)}
      </ol>
      <div className="landing-privacy"><LockKeyhole size={17} aria-hidden="true" /><span><strong>{t('landing.privacyTitle')}</strong> {t('landing.privacyBody')}</span></div>
    </section>

    <section className="landing-cta" aria-labelledby="landing-cta-heading">
      <Hearo pose="wave" size={96} />
      <h2 id="landing-cta-heading">{t('landing.ctaHeading')}</h2>
      <button className="cta-button" type="button" onClick={onLive} data-testid="button-start-live-cta">{t('common.startLiveStudy')} <ArrowRight size={16} aria-hidden="true" /></button>
    </section>
  </section>;
}
