import { motion, useReducedMotion, useSpring } from 'framer-motion';
import { ArrowRight, LockKeyhole } from 'lucide-react';

export function LandingExperience({ onLive, onSample }: { onLive: () => void; onSample: () => void }) {
  const reduced = useReducedMotion();
  const parallaxX = useSpring(0, { stiffness: 65, damping: 22 });
  const parallaxY = useSpring(0, { stiffness: 65, damping: 22 });
  const reveal = (delay: number) => ({
    initial: { opacity: 0, y: reduced ? 0 : 18 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduced ? 0 : 0.65, delay: reduced ? 0 : delay, ease: [0.2, 0.7, 0.2, 1] as const },
  });
  return <section className="landing" data-testid="screen-landing">
    <div className="landing-hero">
      <div className="hero-copy">
        <motion.div className="hero-kicker" {...reveal(0.05)}>Learn by explaining · اشرح لتتعلّم</motion.div>
        <h1 className="hero-title">
          <motion.span className="line" {...reveal(0.13)}>Make the hard</motion.span>
          <motion.span className="line" {...reveal(0.24)}><em>thing yours.</em></motion.span>
        </h1>
        <motion.p className="hero-description" {...reveal(0.34)} dir="auto">
          اشرح الفكرة بطريقتك. Hearo listens quietly, checks each idea against your source, and lets a living concept map take shape.
          <br />No interruptions. No voice replies. Just clearer understanding.
        </motion.p>
        <motion.div className="hero-actions" {...reveal(0.43)}>
          <button className="primary-button" type="button" onClick={onLive} data-testid="button-start-live">
            Prepare a live study <ArrowRight size={16} />
          </button>
          <button className="secondary-button" type="button" onClick={onSample} data-testid="button-start-sample">
            Explore the offline sample
          </button>
        </motion.div>
        <motion.p className="hero-caption" {...reveal(0.5)}>Arabic-first by design · Your words stay yours · No text-to-speech</motion.p>
      </div>
      <motion.div className="hero-art" style={{ rotateX: parallaxY, rotateY: parallaxX }} onPointerMove={event => {
        if (reduced || event.pointerType !== 'mouse') return;
        const rect = event.currentTarget.getBoundingClientRect();
        parallaxX.set(((event.clientX - rect.left) / rect.width - .5) * 5);
        parallaxY.set(-((event.clientY - rect.top) / rect.height - .5) * 5);
      }} onPointerLeave={() => { parallaxX.set(0); parallaxY.set(0); }} initial={{ opacity: 0, scale: reduced ? 1 : .96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: reduced ? 0 : .9, delay: reduced ? 0 : .18 }} aria-label="Illustration of a voice pulse flowing into a concept map" role="img">
        <div className="pulse-orbit" />
        <div className="voice-core"><div className="voice-bars" aria-hidden="true">{Array.from({ length: 9 }, (_, index) => <i key={index} />)}</div></div>
        <div className="floating-map">
          <div className="floating-map-head"><span>CONCEPT MAP · PREVIEW</span><span className="map-live"><i /> source-led</span></div>
          <div className="hero-map-node"><i /><span>توزيع الحمل</span><small>lines 1–2</small></div>
          <div className="hero-map-node"><i /><span>Cache freshness</span><small>caveat · 6</small></div>
          <div className="hero-map-node"><i /><span>نسخ البيانات</span><small>next idea</small></div>
        </div>
      </motion.div>
    </div>
    <div className="hero-scroll" aria-hidden="true">A DIFFERENT KIND OF STUDY SESSION　↓</div>
    <section className="landing-story" id="how-it-works">
      <div className="story-head">
        <div><span className="hero-kicker">THE QUIET CHECK</span><h2>Thinking out loud is the lesson.</h2></div>
        <p>Hearo follows your explanation—not a script—and keeps every check tied to the source you chose.</p>
      </div>
      <div className="story-grid">
        <motion.article className="story-card" initial={{ opacity: 0, y: reduced ? 0 : 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .25 }} transition={{ duration: reduced ? 0 : .45 }}><span>01 / EXPLAIN</span><h3>Start with your own words</h3><p>Speak in Arabic or English, or type. Your explanation remains editable, exactly where you left it.</p></motion.article>
        <motion.article className="story-card" initial={{ opacity: 0, y: reduced ? 0 : 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .25 }} transition={{ duration: reduced ? 0 : .45, delay: reduced ? 0 : .08 }}><span>02 / CONNECT</span><h3>See ideas take their place</h3><p>A concept map links the ideas together. Evidence and source lines stay close to each check.</p></motion.article>
        <motion.article className="story-card" initial={{ opacity: 0, y: reduced ? 0 : 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, amount: .25 }} transition={{ duration: reduced ? 0 : .45, delay: reduced ? 0 : .16 }}><span>03 / RETURN</span><h3>Leave with a next question</h3><p>Review what was demonstrated, what needs another pass, and the evidence behind the conversation.</p></motion.article>
      </div>
      <div className="landing-privacy"><LockKeyhole size={17} /><span><strong>Private by design.</strong> Hearo does not retain microphone audio or the PDF. Live explanation text and selected source passages are sent for checking when enabled. Drafts and reports remain in this browser profile and can be deleted here.</span></div>
    </section>
  </section>;
}
