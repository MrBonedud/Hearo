import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Pause, Play, Repeat, Volume2, VolumeX } from 'lucide-react';
import VideoTemplate, { SCENE_DURATIONS } from './VideoTemplate';
import { useSceneControls } from './useSceneControls';

const F = 'src/components/video/scenes/';
const SCENE_DETAILS: Record<string, { title: string; filePath: string }> = {
  open: { title: 'Opening', filePath: F + 'StoryScenes.tsx' },
  problem: { title: 'Problem', filePath: F + 'StoryScenes.tsx' },
  opportunity: { title: 'Opportunity', filePath: F + 'StoryScenes.tsx' },
  reveal: { title: 'Product reveal', filePath: F + 'DemoScenes.tsx' },
  check: { title: 'Live check', filePath: F + 'DemoScenes.tsx' },
  wrong: { title: 'Catch a wrong claim', filePath: F + 'DemoScenes.tsx' },
  arabic: { title: 'Arabic', filePath: F + 'DemoScenes.tsx' },
  report: { title: 'Report', filePath: F + 'DemoScenes.tsx' },
  diff: { title: 'Differentiation', filePath: F + 'ValueScenes.tsx' },
  pilot: { title: 'Pilot', filePath: F + 'ValueScenes.tsx' },
  close: { title: 'Close', filePath: F + 'ValueScenes.tsx' },
};

function fmt(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, '0')}`;
}

function PlaybackStatus({ sceneKeys, activeIndex, activeDuration, activeStartTime, totalDuration, tick, paused, onJumpTo }: {
  sceneKeys: string[]; activeIndex: number; activeDuration: number; activeStartTime: number; totalDuration: number; tick: number; paused: boolean; onJumpTo: (i: number) => void;
}) {
  const [elapsed, setElapsed] = useState(0);
  const base = useRef(0);
  useEffect(() => { setElapsed(0); base.current = 0; }, [tick]);
  useEffect(() => {
    if (paused) return;
    const start = performance.now();
    const id = window.setInterval(() => setElapsed(base.current + performance.now() - start), 60);
    return () => { window.clearInterval(id); base.current += performance.now() - start; };
  }, [tick, paused]);
  const progress = activeDuration > 0 ? Math.min(1, elapsed / activeDuration) : 0;
  const total = Math.min(totalDuration, activeStartTime + Math.min(elapsed, activeDuration));
  return (
    <>
      <div className="flex-1 flex items-center gap-1.5">
        {sceneKeys.map((k, i) => (
          <button key={k} onClick={() => onJumpTo(i)} aria-label={`Jump to scene ${i + 1}`} className="flex-1 h-3 bg-white/20 rounded-full overflow-hidden cursor-pointer hover:h-4 transition-all relative min-h-[12px]">
            <div className="absolute inset-y-0 left-0 bg-white/90 rounded-full" style={{ width: `${i === activeIndex ? progress * 100 : 0}%` }} />
          </button>
        ))}
      </div>
      <div className="text-xl text-white/60 font-mono tabular-nums shrink-0">{activeIndex + 1}/{sceneKeys.length}</div>
      <div className="min-w-[11ch] text-right text-xl text-white/80 font-mono tabular-nums shrink-0">{fmt(total)} / {fmt(totalDuration)}</div>
    </>
  );
}

export default function VideoWithControls() {
  const isIframed = typeof window !== 'undefined' && window.self !== window.top;
  const c = useSceneControls(SCENE_DURATIONS);
  const [muted, setMuted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [hovering, setHovering] = useState(false);

  const handleJumpTo = useCallback((index: number) => {
    c.jumpTo(index);
    const key = c.sceneKeys[index];
    const d = SCENE_DETAILS[key];
    if (!d) return;
    window.parent.postMessage({ type: 'REPLIT_VIDEO_SCENE_SELECTED', payload: { sceneIndex: index, sceneCount: c.sceneKeys.length, sceneTitle: d.title, filePath: d.filePath, lineNumber: 1 } }, '*');
  }, [c]);

  useEffect(() => {
    if (!c.paused) return;
    const frozen = document.getAnimations().filter((a) => a.playState === 'running');
    frozen.forEach((a) => a.pause());
    const vids = Array.from(document.querySelectorAll('video')).filter((v) => !v.paused);
    vids.forEach((v) => v.pause());
    return () => { frozen.forEach((a) => a.play()); vids.forEach((v) => v.play().catch(() => {})); };
  }, [c.paused]);

  if (!isIframed) return <VideoTemplate />;

  const visible = !collapsed || hovering;
  const btn = 'w-14 h-14 flex items-center justify-center text-white/60 hover:text-white hover:bg-white/10 transition-colors rounded-lg shrink-0';
  return (
    <div className="relative w-full h-screen">
      <VideoTemplate key={c.mountKey} durations={c.durations} loop paused={c.paused} muted={muted} onSceneChange={c.onSceneChange} />
      <div className="absolute bottom-0 left-0 right-0 z-50 flex flex-col justify-end" style={{ height: '25%' }}
        onPointerEnter={(e) => e.pointerType === 'mouse' && setHovering(true)}
        onPointerLeave={(e) => e.pointerType === 'mouse' && setHovering(false)}>
        <div className="flex-1 w-full" aria-hidden="true" />
        <div className={`flex items-center gap-3 bg-black/50 backdrop-blur-sm px-5 py-4 transition-all duration-200 ${visible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'}`}>
          <button className={btn} onClick={c.togglePause} aria-label={c.paused ? 'Play' : 'Pause'}>{c.paused ? <Play className="w-8 h-8" /> : <Pause className="w-8 h-8" />}</button>
          <button className={`${btn} ${c.locked ? 'bg-white/15 text-white' : ''}`} onClick={c.toggleLock} aria-pressed={c.locked} aria-label="Loop current scene"><Repeat className="w-8 h-8" /></button>
          <button className={btn} onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Unmute' : 'Mute'}>{muted ? <VolumeX className="w-8 h-8" /> : <Volume2 className="w-8 h-8" />}</button>
          <div className="w-px self-stretch bg-white/15" />
          <PlaybackStatus sceneKeys={c.sceneKeys} activeIndex={c.activeIndex} activeDuration={c.activeDuration} activeStartTime={c.activeStartTime} totalDuration={c.totalDuration} tick={c.tick} paused={c.paused} onJumpTo={handleJumpTo} />
          <button className={btn} onClick={() => { setCollapsed((x) => !x); setHovering(false); }} aria-label="Toggle controls">{collapsed ? <ChevronUp className="w-10 h-10" /> : <ChevronDown className="w-10 h-10" />}</button>
        </div>
      </div>
    </div>
  );
}
