import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { useSceneTimer } from '@/lib/video';
import { NARRATION, type Rich, type SceneKey } from './content';

export const asset = (p: string) => `${import.meta.env.BASE_URL}${p}`;

/** Returns how many of the given times (ms) have elapsed in this scene. */
export function useStep(times: number[]) {
  const [step, setStep] = useState(0);
  const events = useMemo(
    () => times.map((time, i) => ({ time, callback: () => setStep((s) => Math.max(s, i + 1)) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [times.join(',')],
  );
  useSceneTimer(events);
  return step;
}

export const ease = [0.22, 1, 0.36, 1] as const;

export function Scene({ children, bg, className = '' }: { children: ReactNode; bg: string; className?: string }) {
  return (
    <motion.div
      className={`absolute inset-0 overflow-hidden grain ${className}`}
      style={{ background: bg }}
      initial={{ opacity: 0, scale: 1.04 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.55, ease }}
    >
      {children}
    </motion.div>
  );
}

export function Mask({ show, children, delay = 0, style }: { show: boolean; children: ReactNode; delay?: number; style?: CSSProperties }) {
  return (
    <span style={{ display: 'block', overflow: 'hidden', paddingBottom: '0.08em', ...style }}>
      <motion.span
        style={{ display: 'block' }}
        initial={{ y: '105%' }}
        animate={{ y: show ? '0%' : '105%' }}
        transition={{ duration: 0.75, ease, delay }}
      >
        {children}
      </motion.span>
    </span>
  );
}

export type Segment = { from: number; to: number; rate: number };

/** Plays a real capture through a list of source ranges (some sped up). */
export function Footage({ src, segments }: { src: string; segments: Segment[] }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const segKey = JSON.stringify(segments);
  useEffect(() => {
    const segs: Segment[] = JSON.parse(segKey);
    const v = ref.current;
    if (!v) return;
    const timers: number[] = [];
    let at = 0;
    segs.forEach((s) => {
      timers.push(
        window.setTimeout(() => {
          v.currentTime = s.from;
          v.playbackRate = s.rate;
          v.play().catch(() => {});
        }, at),
      );
      const len = ((s.to - s.from) / s.rate) * 1000;
      at += len;
      timers.push(window.setTimeout(() => v.pause(), at - 30));
    });
    return () => timers.forEach(clearTimeout);
  }, [segKey]);
  return (
    <video
      ref={ref}
      src={asset(src)}
      muted
      playsInline
      preload="auto"
      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
    />
  );
}

/** Product window chrome around real footage. */
export function Window({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{
        borderRadius: '1.4vmin',
        overflow: 'hidden',
        background: '#fff',
        boxShadow: '0 4vmin 9vmin -3vmin rgba(15,23,42,.45), 0 0 0 1px rgba(15,23,42,.08)',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Tag({ children, color = 'var(--navy)', style }: { children: ReactNode; color?: string; style?: CSSProperties }) {
  return (
    <span
      className="mono"
      style={{
        fontSize: '1.7vmin',
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color,
        ...style,
      }}
    >
      {children}
    </span>
  );
}

/** Subtitles: split the narration into sentences timed by character length. */
export function Captions({ sceneKey }: { sceneKey: SceneKey }) {
  const n = NARRATION[sceneKey];
  const parts = useMemo(() => {
    const sents = n.text.match(/[^.?!]+[.?!]+/g) ?? [n.text];
    if (n.cues && n.cues.length === sents.length) {
      return sents.map((s, i) => ({ s: s.trim(), start: n.start + n.cues![i] * 1000 }));
    }
    const total = sents.reduce((a, s) => a + s.length, 0);
    let t = n.start;
    return sents.map((s) => {
      const start = t;
      t += (s.length / total) * n.len;
      return { s: s.trim(), start };
    });
  }, [n]);
  const step = useStep([...parts.map((p) => p.start), n.start + n.len + 400]);
  const idx = step - 1;
  const text = idx >= 0 && idx < parts.length ? parts[idx].s : '';
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: '3.2%', display: 'flex', justifyContent: 'center', pointerEvents: 'none', zIndex: 40 }}>
      {text && (
        <motion.div
          key={sceneKey + idx}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="sans"
          style={{
            maxWidth: '62%',
            textAlign: 'center',
            fontSize: '2.5vmin',
            lineHeight: 1.35,
            fontWeight: 500,
            color: '#F8FAFC',
            background: 'rgba(15,23,42,.78)',
            padding: '0.9vmin 2vmin',
            borderRadius: '0.8vmin',
          }}
        >
          {text}
        </motion.div>
      )}
    </div>
  );
}

/** Renders a Rich copy array from content.ts with its inline emphasis. */
export function RichText({ r }: { r: Rich }) {
  return (
    <>
      {r.map((seg, i) => {
        if (typeof seg === 'string') return <Fragment key={i}>{seg}</Fragment>;
        const style = seg.color ? { color: seg.color } : undefined;
        if (seg.b) return <b key={i} style={style}>{seg.t}</b>;
        if (seg.i) return <i key={i} style={style}>{seg.t}</i>;
        if (seg.mono) return <span key={i} className="mono">{seg.t}</span>;
        if (seg.ar) return <span key={i} style={{ fontFamily: 'IBM Plex Sans Arabic' }}>{seg.t}</span>;
        return <span key={i} style={style}>{seg.t}</span>;
      })}
    </>
  );
}
