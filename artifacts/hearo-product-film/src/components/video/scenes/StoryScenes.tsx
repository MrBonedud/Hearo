import { motion } from 'framer-motion';
import { Mask, Scene, Tag, asset, ease, useStep } from '../kit';
import { COPY, PRODUCT } from '../content';

/* 1 — Opening: the mascot listens; the name lands in serif. */
export function OpenScene() {
  const s = useStep([250, 700, 1200, 2300, 3600, 5900]);
  return (
    <Scene bg="radial-gradient(120% 90% at 70% 40%, #24479f 0%, var(--navy) 45%, var(--navy2) 100%)">
      {/* listening rings */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={i}
          style={{ position: 'absolute', left: '68%', top: '50%', width: '40vmin', height: '40vmin', marginLeft: '-20vmin', marginTop: '-20vmin', borderRadius: '50%', border: '1px solid rgba(147,197,253,.35)' }}
          initial={{ scale: 0.6, opacity: 0 }}
          animate={s >= 1 ? { scale: [0.6, 2.4], opacity: [0.7, 0] } : {}}
          transition={{ duration: 3.2, delay: i * 1.05, repeat: Infinity, ease: 'easeOut' }}
        />
      ))}
      <motion.img
        src={asset('images/hearo-wave.png')}
        style={{ position: 'absolute', left: '68%', top: '52%', height: '72vmin', x: '-50%', y: '-50%' }}
        initial={{ scale: 0.82, opacity: 0, rotate: -6 }}
        animate={{ scale: s >= 6 ? 1.12 : 1, opacity: 1, rotate: 0 }}
        transition={{ type: 'spring', stiffness: 240, damping: 22 }}
      />
      <div style={{ position: 'absolute', left: '7%', top: '24%', color: '#F8FAFC' }}>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: s >= 2 ? 1 : 0 }}>
          <Tag color="var(--sky)">{COPY.open.eyebrow}</Tag>
        </motion.div>
        <div className="serif" style={{ fontSize: '30vmin', lineHeight: 0.9, marginTop: '2vmin' }}>
          <Mask show={s >= 3}>{PRODUCT.name}</Mask>
        </div>
        <div className="serif" style={{ fontSize: '7vmin', fontStyle: 'italic', color: 'var(--tint)', marginTop: '2vmin' }}>
          <Mask show={s >= 4}>{PRODUCT.promise}</Mask>
        </div>
        <motion.div
          style={{ height: 2, background: 'var(--gold)', transformOrigin: 'left', width: '22vmin', marginTop: '3vmin' }}
          initial={{ scaleX: 0 }}
          animate={{ scaleX: s >= 5 ? 1 : 0 }}
          transition={{ duration: 0.9, ease }}
        />
      </div>
    </Scene>
  );
}

/* 2 — Problem: familiar study habits get struck through; a hidden wrong idea surfaces in red. */
export function ProblemScene() {
  const s = useStep([200, 1700, 3600, 5600, 7400, 9300, 11200]);
  const habit = (label: string, on: boolean, strike: boolean) => (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <Mask show={on}>{label}</Mask>
      <motion.div
        style={{ position: 'absolute', left: '-2%', right: '-2%', top: '52%', height: '0.9vmin', background: 'var(--red)', transformOrigin: 'left' }}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: strike ? 1 : 0 }}
        transition={{ duration: 0.5, ease }}
      />
    </div>
  );
  return (
    <Scene bg="var(--paper)">
      <div style={{ position: 'absolute', left: '7%', top: '9%' }}>
        <Tag>{COPY.problem.eyebrow}</Tag>
      </div>
      <div className="serif" style={{ position: 'absolute', left: '7%', top: '17%', fontSize: '10vmin', lineHeight: 1, color: 'var(--ink)' }}>
        <Mask show={s >= 1}>{COPY.problem.headline1}</Mask>
        <Mask show={s >= 1} delay={0.12}><i style={{ color: 'var(--navy)' }}>{COPY.problem.headline2}</i></Mask>
      </div>
      <div className="serif" style={{ position: 'absolute', left: '7%', top: '50%', fontSize: '8vmin', lineHeight: 1.15, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: '0.5vmin' }}>
        {habit(COPY.problem.habits[0], s >= 2, s >= 4)}
        {habit(COPY.problem.habits[1], s >= 3, s >= 4)}
      </div>
      {/* the hidden wrong idea */}
      <motion.div
        style={{ position: 'absolute', right: '7%', top: '22%', width: '44%', background: '#fff', borderRadius: '1.6vmin', padding: '3.5vmin', boxShadow: '0 3vmin 7vmin -3vmin rgba(15,23,42,.25)' }}
        initial={{ opacity: 0, y: 40, rotate: 2 }}
        animate={{ opacity: s >= 5 ? 1 : 0, y: s >= 5 ? 0 : 40, rotate: s >= 7 ? 0 : 2 }}
        transition={{ duration: 0.8, ease }}
      >
        <Tag color="var(--muted)">{COPY.problem.noteLabel}</Tag>
        <div className="sans" style={{ fontSize: '3.2vmin', lineHeight: 1.45, color: 'var(--ink)', marginTop: '2vmin' }}>
          {COPY.problem.note.before}{' '}
          <span style={{ position: 'relative', whiteSpace: 'nowrap' }}>
            {COPY.problem.note.marked}
            <motion.span style={{ position: 'absolute', left: 0, right: 0, bottom: '-0.3vmin', height: '0.5vmin', background: 'var(--red)', transformOrigin: 'left' }} initial={{ scaleX: 0 }} animate={{ scaleX: s >= 6 ? 1 : 0 }} transition={{ duration: 0.6 }} />
          </span>
          {COPY.problem.note.after}
        </div>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: s >= 6 ? 1 : 0 }} className="sans" style={{ marginTop: '2.5vmin', fontSize: '2.4vmin', color: 'var(--red)', fontWeight: 600 }}>
          {COPY.problem.noteVerdict}
        </motion.div>
      </motion.div>
    </Scene>
  );
}

/* 3 — Opportunity: two halves — speak / check — joined by a line drawn between them. */
export function OpportunityScene() {
  const s = useStep([150, 900, 2600, 4200, 5200, 6300]);
  return (
    <Scene bg="var(--navy)">
      <div style={{ position: 'absolute', left: '7%', top: '9%' }}><Tag color="var(--sky)">{COPY.opportunity.eyebrow}</Tag></div>
      <div className="serif" style={{ position: 'absolute', left: '7%', top: '22%', fontSize: '15vmin', lineHeight: 0.95, color: '#F8FAFC' }}>
        <Mask show={s >= 1}>{COPY.opportunity.line1}</Mask>
        <div style={{ height: '3vmin' }} />
        <Mask show={s >= 3}><i style={{ color: 'var(--gold)' }}>{COPY.opportunity.line2}</i></Mask>
        <motion.div style={{ height: '0.6vmin', width: '52vmin', background: 'var(--gold)', transformOrigin: 'left', marginTop: '1vmin' }} initial={{ scaleX: 0 }} animate={{ scaleX: s >= 5 ? 1 : 0 }} transition={{ duration: 1.3, ease }} />
      </div>
      <motion.div className="sans" style={{ position: 'absolute', left: '7.4%', top: '70%', width: '44%', fontSize: '3.1vmin', lineHeight: 1.4, color: 'var(--tint)' }} initial={{ opacity: 0 }} animate={{ opacity: s >= 4 ? 1 : 0 }}>
        {COPY.opportunity.body}
      </motion.div>
      {/* mascot shown near native size on an app-style tint disc */}
      <motion.div
        style={{ position: 'absolute', right: '9%', top: '50%', width: '56vmin', height: '56vmin', marginTop: '-28vmin', borderRadius: '50%', background: 'radial-gradient(circle at 50% 45%, #F8FAFC 0%, var(--tint) 70%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4vmin 10vmin -4vmin rgba(0,0,0,.45)' }}
        initial={{ scale: 0.7, opacity: 0 }}
        animate={{ scale: s >= 2 ? (s >= 6 ? 1.05 : 1) : 0.7, opacity: s >= 2 ? 1 : 0 }}
        transition={{ type: 'spring', stiffness: 160, damping: 20 }}
      >
        <motion.img
          src={asset('images/hearo-thinking.png')}
          style={{ height: '36vmin' }}
          animate={{ y: ['0%', '-3%', '0%'] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>
    </Scene>
  );
}
