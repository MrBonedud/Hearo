export type HearoPose = 'wave' | 'mic' | 'thumbsup' | 'thinking';

export interface HearoProps {
  pose: HearoPose;
  /** Rendered height in pixels; width follows the image's own aspect ratio. */
  size?: number;
  floating?: boolean;
  glow?: boolean;
  className?: string;
}

// Natural pixel sizes of the cropped character images, used to reserve space before they load.
const naturalSize: Record<HearoPose, { width: number; height: number }> = {
  wave: { width: 269, height: 315 },
  mic: { width: 226, height: 316 },
  thumbsup: { width: 235, height: 317 },
  thinking: { width: 237, height: 317 },
};

export function hearoImageUrl(pose: HearoPose) {
  return `${import.meta.env?.BASE_URL ?? '/'}character/hearo-${pose}.png`;
}

export function Hearo({ pose, size = 120, floating = false, glow = false, className = '' }: HearoProps) {
  const natural = naturalSize[pose];
  const width = Math.round(size * natural.width / natural.height);
  const classes = ['hearo', floating ? 'hearo-floating' : '', glow ? 'hearo-glow' : '', className].filter(Boolean).join(' ');
  return <span className={classes} style={{ width, height: size }} data-pose={pose}>
    <img src={hearoImageUrl(pose)} alt="Hearo, your AI learning companion" width={width} height={size} draggable={false} decoding="async" />
  </span>;
}
