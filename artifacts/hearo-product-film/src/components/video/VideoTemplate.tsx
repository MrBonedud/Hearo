import { useEffect, useRef, type ComponentType } from 'react';
import { AnimatePresence } from 'framer-motion';
import { VideoCanvas, VideoPausedContext, type VideoAspectRatio, useVideoPlayer } from '@/lib/video';
import { SCENE_DURATIONS, type SceneKey } from './content';
import { Captions, asset } from './kit';
import { OpenScene, OpportunityScene, ProblemScene } from './scenes/StoryScenes';
import { ArabicScene, CheckScene, ReportScene, RevealScene, WrongScene } from './scenes/DemoScenes';
import { CloseScene, DiffScene, PilotScene } from './scenes/ValueScenes';

export { SCENE_DURATIONS };

const VIDEO_ASPECT_RATIO: VideoAspectRatio = '16:9';

const SCENE_COMPONENTS: Record<SceneKey, ComponentType> = {
  open: OpenScene,
  problem: ProblemScene,
  opportunity: OpportunityScene,
  reveal: RevealScene,
  check: CheckScene,
  wrong: WrongScene,
  arabic: ArabicScene,
  report: ReportScene,
  diff: DiffScene,
  pilot: PilotScene,
  close: CloseScene,
};

const SCENE_START_SEC: Record<string, number> = (() => {
  const out: Record<string, number> = {};
  let ms = 0;
  for (const [k, d] of Object.entries(SCENE_DURATIONS)) {
    out[k] = ms / 1000;
    ms += d;
  }
  return out;
})();

export default function VideoTemplate({
  durations = SCENE_DURATIONS,
  loop = true,
  paused = false,
  muted = false,
  onSceneChange,
}: {
  durations?: Record<string, number>;
  loop?: boolean;
  paused?: boolean;
  muted?: boolean;
  onSceneChange?: (sceneKey: string) => void;
} = {}) {
  const { currentSceneKey } = useVideoPlayer({ durations, loop, paused });
  useEffect(() => {
    onSceneChange?.(currentSceneKey);
  }, [currentSceneKey, onSceneChange]);
  const baseSceneKey = currentSceneKey.replace(/_r[12]$/, '') as SceneKey;
  const SceneComponent = SCENE_COMPONENTS[baseSceneKey];

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lastSceneKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = 1;
    if (paused) {
      audio.pause();
      return;
    }
    if (lastSceneKeyRef.current !== currentSceneKey) {
      lastSceneKeyRef.current = currentSceneKey;
      const t = SCENE_START_SEC[baseSceneKey] ?? 0;
      if (Math.abs(audio.currentTime - t) > 0.18) audio.currentTime = t;
    }
    audio.play().catch(() => {});
  }, [currentSceneKey, baseSceneKey, muted, paused]);

  return (
    <VideoPausedContext.Provider value={paused}>
      <VideoCanvas aspectRatio={VIDEO_ASPECT_RATIO} style={{ backgroundColor: 'var(--navy2)' }}>
        <AnimatePresence mode="popLayout">
          {SceneComponent && <SceneComponent key={currentSceneKey} />}
        </AnimatePresence>
        {SceneComponent && <Captions key={'cap-' + currentSceneKey} sceneKey={baseSceneKey} />}
        <audio ref={audioRef} src={asset('audio/composite_audio.mp3')} preload="auto" autoPlay muted={muted} />
      </VideoCanvas>
    </VideoPausedContext.Provider>
  );
}
