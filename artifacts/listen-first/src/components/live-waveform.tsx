import { useEffect, useRef, useState } from 'react';

export function LiveWaveform({ active }: { active: boolean }) {
  const barsRef = useRef<HTMLSpanElement[]>([]);
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    if (!active || !navigator.mediaDevices?.getUserMedia) {
      setAvailable(false);
      return;
    }
    let stream: MediaStream | null = null;
    let context: AudioContext | null = null;
    let frame = 0;
    let alive = true;
    void navigator.mediaDevices.getUserMedia({ audio: true }).then(media => {
      if (!alive) { media.getTracks().forEach(track => track.stop()); return; }
      stream = media;
      context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 64;
      context.createMediaStreamSource(media).connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);
      setAvailable(true);
      const draw = () => {
        analyser.getByteFrequencyData(data);
        barsRef.current.forEach((bar, index) => {
          if (!bar) return;
          const level = data[Math.min(index, data.length - 1)] / 255;
          bar.style.transform = `scaleY(${Math.max(.18, .18 + level * 1.35)})`;
        });
        frame = requestAnimationFrame(draw);
      };
      draw();
    }).catch(() => { if (alive) setAvailable(false); });
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach(track => track.stop());
      if (context && context.state !== 'closed') void context.close();
    };
  }, [active]);
  return <span className={`live-waveform ${active ? 'waveform-active' : ''}`} aria-label={active ? available ? 'Live microphone level visualization' : 'Decorative audio pulse' : 'Audio pulse idle'} role="img" data-testid="live-waveform">
    {Array.from({ length: 13 }, (_, index) => <i key={index} ref={node => { if (node) barsRef.current[index] = node; }} />)}
  </span>;
}
