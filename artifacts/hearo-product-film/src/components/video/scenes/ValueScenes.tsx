import { motion } from 'framer-motion';
import { Mask, Scene, Tag, asset, ease, useStep } from '../kit';
import { COPY, CTA, PLACEHOLDERS, PRODUCT } from '../content';

/* 9 — Differentiation: three principles, each pinned to a real still crop. */
export function DiffScene() {
  const s = useStep([100, 900, 3300, 5800, 8600, 9400]);
  const rows = [
    { ...COPY.diff.principles[0], img: '03b-supported-citations.png', pos: '45% 55%', contain: false },
    { ...COPY.diff.principles[1], img: '04b-contradiction-card.png', pos: '40% 58%', contain: false },
    { ...COPY.diff.principles[2], img: '01-home.png', pos: 'center', contain: true },
  ];
  const active = Math.min(3, Math.max(1, s - 1));
  const all = s >= 5;
  const spans = [2400, 2500, 2800];
  return (
    <Scene bg="var(--paper)">
      <motion.div style={{ position: 'absolute', inset: 0 }} animate={{ scale: s >= 6 ? 1.035 : 1 }} transition={{ duration: 1.6, ease }}>
      <div style={{ position: 'absolute', left: '6%', top: '9%' }}><Tag>{COPY.diff.eyebrow}</Tag></div>
      <div style={{ position: 'absolute', left: '6%', top: '18%', width: '44%' }}>
        {rows.map((r, i) => (
          <motion.div
            key={r.k}
            style={{ padding: '2.4vmin 0', borderTop: '1px solid var(--line)' }}
            animate={{ opacity: s >= i + 2 ? (active === i + 1 || all ? 1 : 0.4) : 0 }}
            transition={{ duration: 0.5 }}
          >
            <motion.div style={{ height: 2, background: 'var(--navy)', transformOrigin: 'left', marginTop: '-2.4vmin', marginBottom: '2.2vmin' }} initial={{ scaleX: 0 }} animate={{ scaleX: s >= i + 2 ? 1 : 0 }} transition={{ duration: spans[i] / 1000, ease: 'linear' }} />
            <div className="serif" style={{ fontSize: '7.5vmin', lineHeight: 1, color: active === i + 1 ? 'var(--navy)' : 'var(--ink)' }}>{r.k}</div>
            <div className="sans" style={{ fontSize: '2.5vmin', color: 'var(--muted)', marginTop: '1vmin' }}>{r.d}</div>
          </motion.div>
        ))}
      </div>
      <div style={{ position: 'absolute', right: '5%', top: '12%', width: '42%', height: '68%', borderRadius: '1.6vmin', overflow: 'hidden', boxShadow: '0 4vmin 9vmin -4vmin rgba(15,23,42,.4)', background: '#fff' }}>
        {rows.map((r, i) => (
          <motion.div
            key={r.img}
            style={{ position: 'absolute', inset: 0, backgroundImage: `url(${asset('images/' + r.img)})`, backgroundSize: r.contain ? 'contain' : '180%', backgroundRepeat: 'no-repeat', backgroundColor: '#F8FAFC', backgroundPosition: r.pos }}
            initial={{ opacity: 0, scale: 1.08 }}
            animate={{ opacity: s >= i + 2 && active === i + 1 ? 1 : 0, scale: active === i + 1 ? 1 : 1.08 }}
            transition={{ duration: 0.8, ease }}
          />
        ))}
      </div>
      <motion.div className="mono" style={{ position: 'absolute', right: '5%', top: '81.5%', fontSize: '1.5vmin', color: 'var(--muted)' }} animate={{ opacity: s >= 2 ? 1 : 0 }}>
        {COPY.diff.stillsLabel}
      </motion.div>
      </motion.div>
    </Scene>
  );
}

/* 10 — Pilot: a proposed measurement framework, honest about what does not exist yet. */
export function PilotScene() {
  const s = useStep([100, 1200, 2400, 3400, 4400, 5400, 6600, 7600, 8600, 9500]);
  const hi = s >= 7 ? Math.min(4, s - 6) : 0;
  const metrics = COPY.pilot.measures;
  return (
    <Scene bg="var(--navy)">
      <div style={{ position: 'absolute', left: '6%', top: '9%' }}><Tag color="var(--sky)">{COPY.pilot.eyebrow}</Tag></div>
      <div className="serif" style={{ position: 'absolute', left: '6%', top: '17%', fontSize: '11vmin', lineHeight: 0.95, color: '#F8FAFC', width: '40%' }}>
        <Mask show={s >= 1}>{COPY.pilot.headline1}</Mask>
        <Mask show={s >= 1} delay={0.1}><i style={{ color: 'var(--gold)' }}>{COPY.pilot.headline2}</i></Mask>
        <motion.div style={{ height: '0.6vmin', width: '30vmin', background: 'var(--gold)', transformOrigin: 'left', marginTop: '1.5vmin' }} initial={{ scaleX: 0 }} animate={{ scaleX: s >= 7 ? 1 : 0 }} transition={{ duration: 3.4, ease: 'linear' }} />
      </div>
      <motion.div className="sans" style={{ position: 'absolute', left: '6%', top: '52%', width: '36%', fontSize: '2.6vmin', lineHeight: 1.45, color: 'var(--tint)' }} animate={{ opacity: s >= 2 ? 1 : 0 }}>
        {COPY.pilot.body.replace('{recipient}', PLACEHOLDERS.recipient)}
        <div className="mono" style={{ fontSize: '1.6vmin', color: 'var(--sky)', marginTop: '2.5vmin', letterSpacing: '0.04em' }}>
          {COPY.pilot.status}
        </div>
      </motion.div>
      <div style={{ position: 'absolute', right: '6%', top: '17%', width: '44%' }}>
        <Tag color="var(--sky)">{COPY.pilot.measuresLabel}</Tag>
        {metrics.map(([k, d], i) => (
          <motion.div
            key={k}
            style={{ display: 'flex', gap: '3vmin', alignItems: 'baseline', padding: '2.2vmin 0', borderBottom: '1px solid rgba(147,197,253,.25)' }}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: s >= i + 3 ? (hi === 0 || hi === i + 1 ? 1 : 0.45) : 0, x: s >= i + 3 ? (hi === i + 1 ? 12 : 0) : 20 }}
            transition={{ duration: 0.5, ease }}
          >
            <span className="mono" style={{ color: 'var(--gold)', fontSize: '2vmin' }}>0{i + 1}</span>
            <div>
              <div className="serif" style={{ fontSize: '4.6vmin', color: '#F8FAFC', lineHeight: 1 }}>{k}</div>
              <div className="sans" style={{ fontSize: '2.2vmin', color: 'var(--tint)', marginTop: '0.6vmin' }}>{d}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </Scene>
  );
}

/* 11 — Close: the mascot gives a thumbs-up; promise + editable contact line. */
export function CloseScene() {
  const s = useStep([100, 900, 1700, 2800, 3800]);
  return (
    <Scene bg="radial-gradient(110% 90% at 50% 30%, #2a4fae 0%, var(--navy) 50%, var(--navy2) 100%)">
      <motion.div
        style={{ position: 'absolute', left: '50%', top: '5%', width: '36vmin', height: '36vmin', marginLeft: '-18vmin', borderRadius: '50%', background: 'radial-gradient(circle at 50% 45%, #F8FAFC 0%, var(--tint) 72%)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 260, damping: 18 }}
      >
        <motion.img
          src={asset('images/hearo-thumbsup.png')}
          style={{ height: '31vmin', marginTop: '4vmin' }}
          animate={{ y: ['0%', '-3%', '0%'] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      </motion.div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: '44%', textAlign: 'center', color: '#F8FAFC' }}>
        <div className="serif" style={{ fontSize: '18vmin', lineHeight: 0.9 }}><Mask show={s >= 1}>{PRODUCT.name}</Mask></div>
        <div className="serif" style={{ fontSize: '5.6vmin', fontStyle: 'italic', color: 'var(--tint)', marginTop: '1.5vmin' }}>
          <Mask show={s >= 2}>{PRODUCT.promise} <span style={{ color: 'var(--gold)' }}>{PRODUCT.promise2}</span></Mask>
        </div>
        <motion.div className="sans" style={{ marginTop: '3.5vmin', fontSize: '2.6vmin', fontWeight: 600 }} animate={{ opacity: s >= 3 ? 1 : 0 }}>
          {CTA}
        </motion.div>
        <motion.div className="mono" style={{ marginTop: '1.4vmin', fontSize: '1.9vmin', color: 'var(--sky)' }} animate={{ opacity: s >= 4 ? 1 : 0 }}>
          {PLACEHOLDERS.sender} · {PLACEHOLDERS.contact}
        </motion.div>
      </div>
    </Scene>
  );
}
