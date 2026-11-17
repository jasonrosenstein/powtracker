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
