import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { Footage, Mask, RichText, Scene, Tag, Window, ease, useStep, type Segment } from '../kit';
import { COPY } from '../content';

type Note = { at: number; text: ReactNode; color?: string };

/** Shared demo layout: a real-capture window plus a narrow annotation rail. */
function Demo({
  num, title, clip, segments, notes, side = 'right', disclosure, camera,
}: {
  num: string;
  title: ReactNode;
  clip: string;
  segments: Segment[];
  notes: Note[];
  side?: 'left' | 'right';
  disclosure: string;
  camera: { at: number; scale: number; x: string; y: string }[];
}) {
  const s = useStep([100, ...notes.map((n) => n.at)]);
  const cam = useStep(camera.map((c) => c.at));
  const pose = cam > 0 ? camera[cam - 1] : { scale: 1, x: '0%', y: '0%' };
  const winLeft = side === 'right' ? '4%' : '33%';
  const railLeft = side === 'right' ? '73%' : '4.5%';
  return (
    <Scene bg="linear-gradient(160deg, var(--paper) 0%, #e3e9f5 100%)">
      <motion.div
        style={{ position: 'absolute', left: winLeft, top: '8%', width: '63%', aspectRatio: '16 / 9' }}
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7, ease }}
      >
        <Window style={{ width: '100%', height: '100%' }}>
          <motion.div
            style={{ width: '100%', height: '100%', transformOrigin: 'center' }}
            animate={{ scale: pose.scale, x: pose.x, y: pose.y }}
            transition={{ duration: 1.4, ease }}
          >
            <Footage src={clip} segments={segments} />
          </motion.div>
        </Window>
        <div className="mono" style={{ marginTop: '1.3vmin', fontSize: '1.5vmin', color: 'var(--muted)', letterSpacing: '0.06em' }}>
          {disclosure}
        </div>
      </motion.div>
      <div style={{ position: 'absolute', left: railLeft, top: '9%', width: '23%' }}>
        <Tag>{num}</Tag>
        <div className="serif" style={{ fontSize: '6.4vmin', lineHeight: 1, color: 'var(--ink)', marginTop: '1.6vmin' }}>
          <Mask show={s >= 1}>{title}</Mask>
        </div>
        <div style={{ marginTop: '4vmin', display: 'flex', flexDirection: 'column', gap: '2.2vmin' }}>
          {notes.map((n, i) => (
            <motion.div
              key={i}
              className="sans"
              style={{ borderLeft: `0.5vmin solid ${n.color ?? 'var(--navy)'}`, paddingLeft: '1.8vmin', fontSize: '2.5vmin', lineHeight: 1.35, color: 'var(--ink)' }}
              initial={{ opacity: 0, x: -14 }}
              animate={{ opacity: s >= i + 2 ? 1 : 0.0, x: s >= i + 2 ? 0 : -14 }}
              transition={{ duration: 0.5, ease }}
            >
              {n.text}
            </motion.div>
          ))}
        </div>
      </div>
    </Scene>
  );
}

export function RevealScene() {
  return (
    <Demo
      num={COPY.reveal.eyebrow}
      title={COPY.reveal.title}
      clip="footage/clip1-prepare.mp4"
      segments={[{ from: 0.2, to: 9.2, rate: 1 }]}
      notes={[
        { at: 3600, text: <RichText r={COPY.reveal.notes[0]} /> },
        { at: 6500, text: <RichText r={COPY.reveal.notes[1]} /> },
      ]}
      camera={[{ at: 6800, scale: 1.12, x: '6%', y: '2%' }]}
      disclosure={COPY.reveal.disclosure}
    />
  );
}

export function CheckScene() {
  return (
    <Demo
      num={COPY.check.eyebrow}
      title={COPY.check.title}
      clip="footage/clip2-live-check-correct.mp4"
      side="left"
      segments={[
        { from: 1.0, to: 13.0, rate: 3 },
        { from: 19.6, to: 30.6, rate: 1 },
      ]}
      notes={[
        { at: 1200, text: <RichText r={COPY.check.notes[0]} /> },
        { at: 6000, text: <RichText r={COPY.check.notes[1]} />, color: 'var(--green)' },
        { at: 11000, text: <RichText r={COPY.check.notes[2]} /> },
      ]}
      camera={[{ at: 10000, scale: 1.9, x: '12.7%', y: '13%' }]}
      disclosure={COPY.check.disclosure}
    />
  );
}

export function WrongScene() {
  return (
    <Demo
      num={COPY.wrong.eyebrow}
      title={COPY.wrong.title}
      clip="footage/clip3-catch-wrong-claim.mp4"
      segments={[
        { from: 1.0, to: 7.4, rate: 2 },
        { from: 32.8, to: 41.9, rate: 1 },
      ]}
      notes={[
        { at: 1500, text: <RichText r={COPY.wrong.notes[0]} /> },
        { at: 6500, text: <RichText r={COPY.wrong.notes[1]} />, color: 'var(--red)' },
        { at: 9600, text: <RichText r={COPY.wrong.notes[2]} />, color: 'var(--red)' },
      ]}
      camera={[{ at: 10000, scale: 1.7, x: '6%', y: '-7%' }]}
      disclosure={COPY.wrong.disclosure}
    />
  );
}

export function ArabicScene() {
  return (
    <Demo
      num={COPY.arabic.eyebrow}
      title={COPY.arabic.title}
      clip="footage/clip5-arabic-check.mp4"
      segments={[
        { from: 1.0, to: 10.5, rate: 3 },
        { from: 24.2, to: 31.8, rate: 1.4 },
      ]}
      notes={[
        { at: 900, text: <RichText r={COPY.arabic.notes[0]} /> },
        { at: 4200, text: <RichText r={COPY.arabic.notes[1]} />, color: 'var(--green)' },
        { at: 6600, text: <RichText r={COPY.arabic.notes[2]} /> },
      ]}
      camera={[{ at: 4000, scale: 1.1, x: '-5%', y: '0%' }]}
      disclosure={COPY.arabic.disclosure}
    />
  );
}

export function ReportScene() {
  return (
    <Demo
      num={COPY.report.eyebrow}
      title={COPY.report.title}
      clip="footage/clip4-report.mp4"
      side="left"
      segments={[{ from: 1.0, to: 10.8, rate: 1.3 }]}
      notes={[
        { at: 1600, text: <RichText r={COPY.report.notes[0]} /> },
        { at: 4300, text: <RichText r={COPY.report.notes[1]} /> },
      ]}
      camera={[{ at: 300, scale: 1.08, x: '4%', y: '3%' }]}
      disclosure={COPY.report.disclosure}
    />
  );
}
