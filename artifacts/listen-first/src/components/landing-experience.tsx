import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, AudioLines, BookOpenCheck, LockKeyhole, Network } from 'lucide-react';
import { Hearo } from '@/components/hearo';

const features = [
  { Icon: AudioLines, title: 'Speak. Hearo listens.', arabic: 'تكلّم، وHearo يصغي.', body: 'Explain aloud in Arabic or English, or type. Hearo stays silent and never interrupts your train of thought.' },
  { Icon: BookOpenCheck, title: 'Get feedback as you pause.', arabic: 'ملاحظات عند كل توقّف.', body: 'After a short pause, each idea is checked against the approved source, with the exact lines it relies on.' },
  { Icon: Network, title: 'Watch your concept map grow.', arabic: 'شاهد خريطتك تكبر.', body: 'Ideas turn green, yellow or red as you explain. Every node keeps a text label, so colour is never the only signal.' },
];

const steps = [
  { title: 'Open your source', body: 'This demo uses one approved set of English slides, verified before you start.' },
  { title: 'Explain aloud', body: 'Talk it through in your own words, in Arabic or English. Typing works too.' },
  { title: 'See your progress', body: 'Review what is supported, partial or contradicted, then download your report.' },
];

export function LandingExperience({ onLive, onSample }: { onLive: () => void; onSample: () => void }) {
  const reduced = useReducedMotion();
  const fadeIn = (delay: number) => ({
    initial: { opacity: 0, y: reduced ? 0 : 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduced ? 0 : 0.3, delay: reduced ? 0 : delay, ease: 'easeOut' as const },
  });
  return <section className="landing" data-testid="screen-landing">
    <div className="landing-hero">
      <div className="hero-copy">
        <motion.div className="hero-kicker" {...fadeIn(0)}>Listen-first learning · تعلّم بالإصغاء</motion.div>
        <motion.h1 className="hero-title" {...fadeIn(0.05)}>
          <span className="line">Learn by explaining.</span>
          <span className="line"><em>Master by teaching.</em></span>
        </motion.h1>
        <motion.p className="hero-title-ar" lang="ar" dir="rtl" {...fadeIn(0.1)}>تعلّم بالشرح. أتقن بالتعليم.</motion.p>
        <motion.p className="hero-description" {...fadeIn(0.15)}>
          Explain an idea aloud in Arabic or English. Hearo listens quietly, checks each idea against your source, and maps what you have shown. No interruptions, no voice replies.
        </motion.p>
        <motion.div className="hero-actions" {...fadeIn(0.2)}>
          <button className="primary-button" type="button" onClick={onLive} data-testid="button-start-live">
            Start a live study <ArrowRight size={16} />
          </button>
          <button className="secondary-button" type="button" onClick={onSample} data-testid="button-start-sample">
            Try the guided sample
          </button>
        </motion.div>
        <motion.p className="hero-caption" {...fadeIn(0.25)}>Arabic or English · Source-checked · Hearo never speaks back</motion.p>
      </div>
      <div className="hero-art">
        <Hearo pose="thumbsup" size={280} floating glow />
      </div>
    </div>

    <section className="landing-features" aria-labelledby="landing-features-heading">
      <h2 id="landing-features-heading" className="visually-hidden">What Hearo does</h2>
      <div className="feature-grid">
        {features.map(({ Icon, title, arabic, body }, index) => <motion.article className="feature-card" key={title} {...fadeIn(0.25 + index * 0.06)}>
          <span className="feature-icon" aria-hidden="true"><Icon size={20} /></span>
          <h3>{title}</h3>
          <p className="feature-ar" lang="ar" dir="rtl">{arabic}</p>
          <p>{body}</p>
        </motion.article>)}
      </div>
    </section>

    <section className="landing-story" id="how-it-works" aria-labelledby="how-heading">
      <div className="story-head">
        <span className="hero-kicker">How it works · كيف يعمل</span>
        <h2 id="how-heading">Three steps. No interruptions.</h2>
      </div>
      <ol className="story-grid">
        {steps.map((step, index) => <motion.li className="story-card" key={step.title} {...fadeIn(0.25 + index * 0.06)}>
          <span className="story-number">{String(index + 1).padStart(2, '0')}</span>
          <h3>{step.title}</h3>
          <p>{step.body}</p>
        </motion.li>)}
      </ol>
      <div className="landing-privacy"><LockKeyhole size={17} aria-hidden="true" /><span><strong>Private by design.</strong> Hearo does not retain microphone audio or the PDF. Live explanation text and selected source passages are sent for checking when enabled. Drafts and reports remain in this browser profile and can be deleted here.</span></div>
    </section>

    <section className="landing-cta" aria-labelledby="landing-cta-heading">
      <Hearo pose="wave" size={96} />
      <h2 id="landing-cta-heading">Ready to explain it your way?</h2>
      <p lang="ar" dir="rtl">جاهز تشرح بطريقتك؟</p>
      <button className="cta-button" type="button" onClick={onLive} data-testid="button-start-live-cta">Start a live study <ArrowRight size={16} /></button>
    </section>
  </section>;
}
