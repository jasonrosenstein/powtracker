// Line icons, drawn on a 24 px grid and coloured by the text around them.
import type { ReactNode } from 'react'

function Icon({ children, size = 22, filled = false }: { children: ReactNode; size?: number; filled?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  )
}

export const IconRank = () => <Icon><path d="M5 20V10M12 20V4M19 20v-7" /></Icon>
export const IconMap = () => <Icon><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2ZM9 4v14M15 6v14" /></Icon>
export const IconStar = ({ filled = false, size = 22 }: { filled?: boolean; size?: number }) => (
  <Icon size={size} filled={filled}><path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.8L12 3.5Z" /></Icon>
)
export const IconSearch = () => <Icon size={18}><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></Icon>
export const IconClose = ({ size = 20 }: { size?: number }) => <Icon size={size}><path d="M6 6l12 12M18 6 6 18" /></Icon>
export const IconBack = () => <Icon><path d="M15 5l-7 7 7 7" /></Icon>
export const IconShare = () => <Icon size={20}><path d="M12 15V4M8 7.5 12 3.5l4 4M6 11H5v9h14v-9h-1" /></Icon>
export const IconChevron = () => <Icon size={14}><path d="m6 9 6 6 6-6" /></Icon>
export const IconLayers = () => <Icon size={20}><path d="m12 3 9 5-9 5-9-5 9-5ZM3 13l9 5 9-5" /></Icon>
export const IconPlay = () => <Icon size={18} filled><path d="M7 4.5v15l12-7.5L7 4.5Z" /></Icon>
export const IconPause = () => <Icon size={18} filled><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /></Icon>

/** The sky in one glyph: sun or moon, cloud, snow, rain, fog. */
export function SkyIcon({ sky, night = false, size = 24 }: { sky: string; night?: boolean; size?: number }) {
  const cloud = <path d="M7 18h10a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 7.1 9.2 4.4 4.4 0 0 0 7 18Z" />
  const body =
    sky === 'clear' ? (
      night ? <path d="M19 14.5A7.5 7.5 0 1 1 9.5 5a6 6 0 0 0 9.5 9.5Z" /> : <><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></>
    ) : sky === 'partly' ? (
      <>{night ? <path d="M17.5 6.5a4 4 0 0 1-4.6-3A4.5 4.5 0 0 0 16 11" /> : <><circle cx="16.5" cy="7.5" r="2.6" /><path d="M16.5 2.6v1M21.4 7.5h-1M20 4l-.7.7" /></>}<path d="M6 19h9a3.5 3.5 0 0 0 .5-6.96A5 5 0 0 0 6 11.4 3.9 3.9 0 0 0 6 19Z" /></>
    ) : sky === 'fog' ? (
      <path d="M4 9h16M6 13h12M4 17h16" />
    ) : sky === 'snow' || sky === 'heavy-snow' ? (
      <><path d="M7 14h10a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 7.1 5.2 4.4 4.4 0 0 0 7 14Z" /><path d="M8 18.5h.01M12 18.5h.01M16 18.5h.01M10 21.5h.01M14 21.5h.01" strokeWidth={sky === 'heavy-snow' ? 3 : 2.4} /></>
    ) : sky === 'rain' || sky === 'storm' ? (
      <><path d="M7 14h10a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 7.1 5.2 4.4 4.4 0 0 0 7 14Z" /><path d="M9 17.5 8 21M13 17.5 12 21M17 17.5 16 21" /></>
    ) : (
      cloud
    )
  return <Icon size={size}>{body}</Icon>
}

/** A difficulty mark as it appears on trail signs: disc, square, diamond or double diamond. */
export function DifficultyMark({ color, shape, size = 14 }: { color: string; shape: string; size?: number }) {
  // A hairline in the axis grey keeps a black mark visible on a dark surface.
  const stroke = 'var(--axis)'
  return (
    <svg className="diff-mark" width={shape === 'double' ? size * 1.7 : size} height={size} viewBox={shape === 'double' ? '0 0 24 14' : '0 0 14 14'} aria-hidden="true">
      {shape === 'square' ? (
        <rect x="1.5" y="1.5" width="11" height="11" rx="1.5" fill={color} stroke={stroke} />
      ) : shape === 'diamond' ? (
        <path d="M7 .8 13.2 7 7 13.2.8 7Z" fill={color} stroke={stroke} />
      ) : shape === 'double' ? (
        <><path d="M7 .8 13.2 7 7 13.2.8 7Z" fill={color} stroke={stroke} /><path d="M17 .8 23.2 7 17 13.2 10.8 7Z" fill={color} stroke={stroke} /></>
      ) : (
        <circle cx="7" cy="7" r="5.6" fill={color} stroke={stroke} />
      )}
    </svg>
  )
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path d="M4 24 12 10l5 8 3-5 8 11z" fill="#fff" />
      <path d="m12 10 2.6 4.2-1.6 1.3-1.6-1.6-1.5 1.2L12 10Z" fill="var(--accent)" opacity=".35" />
    </svg>
  )
}

/** Three bars, filled to the confidence level: a quick read before the words. */
export function ConfidenceBars({ level }: { level: 1 | 2 | 3 }) {
  return (
    <svg className="conf-bars" width="16" height="12" viewBox="0 0 16 12" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <rect key={i} x={i * 6} y={8 - i * 4} width="4" height={4 + i * 4} rx="1" className={i < level ? 'on' : 'off'} />
      ))}
    </svg>
  )
}
