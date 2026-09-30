// Small UI glyphs (24 × 24, stroke 2). Original drawings; decorative unless given a label.
const P: Record<string, string> = {
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  gear: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM19.4 13.5l1.6 1.2-2 3.4-1.9-.7a7.6 7.6 0 0 1-2 1.2l-.3 2h-4l-.3-2a7.6 7.6 0 0 1-2-1.2l-1.9.7-2-3.4 1.6-1.2a7.7 7.7 0 0 1 0-2.9L3 9.3l2-3.4 1.9.7a7.6 7.6 0 0 1 2-1.2l.3-2h4l.3 2a7.6 7.6 0 0 1 2 1.2l1.9-.7 2 3.4-1.6 1.3a7.7 7.7 0 0 1 0 2.9z',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3.5 9h17M3.5 15h17M12 3c-2.8 3-2.8 15 0 18M12 3c2.8 3 2.8 15 0 18',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0zM8 6H4.5c0 3 1.5 4.5 3.7 4.8M16 6h3.5c0 3-1.5 4.5-3.7 4.8M12 13v4M8.5 20h7M10 17h4',
  flag: 'M5 21V4M5 4h12l-2.5 4L17 12H5',
  lock: 'M6.5 11h11v9h-11zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  crown: 'M4 18h16M4.5 16L3 7l5 4 4-6 4 6 5-4-1.5 9z',
  bot: 'M6 9h12v10H6zM12 5v4M9.5 13.5h.01M14.5 13.5h.01M4 13v3M20 13v3',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  eye: 'M2.5 12s3.5-6.5 9.5-6.5S21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z',
  eyeOff: 'M3 3l18 18M10.6 5.6A9 9 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.6 6.6C4 8.3 2.5 12 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.3-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2',
  play: 'M7 4.5v15l12.5-7.5z',
  clock: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.5V12l3 2',
  check: 'M4.5 12.5l5 5 10-11',
  x: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6M16 4.3a3.5 3.5 0 0 1 0 6.4M18 14.3c2.2.7 3.5 2.8 3.5 5.7',
  user: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 21c0-4.2 3.3-7 7.5-7s7.5 2.8 7.5 7',
  chat: 'M4 5h16v11H9l-5 4z',
  palette: 'M12 3.5a8.5 8.5 0 0 0 0 17c1.4 0 2-1 1.5-2.2-.6-1.3.3-2.8 1.8-2.8H18a2.5 2.5 0 0 0 2.5-2.5c0-5.3-3.8-9.5-8.5-9.5zM7.5 11h.01M10 7.5h.01M14.5 7.5h.01M17 11h.01',
  brush: 'M14.5 4.5l5 5-8 8-5-5zM6.5 12.5c-2 0-3.5 1.8-3.5 4v3.5h3.5c2.2 0 4-1.5 4-3.5',
  smile: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM8.5 14.5s1.2 2 3.5 2 3.5-2 3.5-2M9 9.5h.01M15 9.5h.01',
  pad: 'M7 7h10a5 5 0 0 1 5 5v2.5a3.5 3.5 0 0 1-6.2 2.2L14.5 15h-5l-1.3 1.7A3.5 3.5 0 0 1 2 14.5V12a5 5 0 0 1 5-5zM7.5 10v4M5.5 12h4M16 11h.01M18 13h.01',
  keyboard: 'M3 6h18v12H3zM6.5 9.5h.01M10 9.5h.01M13.5 9.5h.01M17 9.5h.01M7 14.5h10',
  volume: 'M4 9.5h3.5L12 5.5v13L7.5 14.5H4zM15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11',
  monitor: 'M3 4.5h18v12H3zM8.5 20h7M12 16.5V20',
  info: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 11v5.5M12 7.5h.01',
  download: 'M12 4v11M7 10.5l5 5 5-5M4.5 20h15',
  upload: 'M12 16V5M7 9.5l5-5 5 5M4.5 20h15',
  refresh: 'M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4',
  ghost: 'M5 20V10a7 7 0 0 1 14 0v10l-2.3-1.6L14.3 20 12 18.4 9.7 20l-2.4-1.6zM9.5 10.5h.01M14.5 10.5h.01',
  bolt: 'M13 3L5 13.5h6L10 21l8-10.5h-6z',
  map: 'M3.5 6.5l5.5-2 6 2 5.5-2v13l-5.5 2-6-2-5.5 2zM9 4.5v13M15 6.5v13',
  home: 'M4 11l8-7 8 7M6 9.5V20h12V9.5',
  door: 'M5 20V4h10v16M15 12h6M18 9l3 3-3 3M11.5 12h.01',
  send: 'M4 12l16-8-6 16-2.5-6.5z',
  hash: 'M9.5 4l-2 16M16.5 4l-2 16M4.5 9h16M3.5 15h16',
  timer: 'M12 7.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM12 11v3M10 3.5h4M18 6.5l1.5-1.5',
  kart: 'M3 15.5h18l-1.5-4.5h-4l-2-3.5H8.5L7 11H4.5zM7 18.5a2 2 0 1 0 0-.01zM17 18.5a2 2 0 1 0 0-.01z',
  medal: 'M8 3l2.5 6M16 3l-2.5 6M12 9a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11zM12 12.5v4',
  star: 'M12 3.5l2.6 5.5 6 .8-4.4 4.1 1.1 5.9-5.3-2.9-5.3 2.9 1.1-5.9-4.4-4.1 6-.8z',
  target: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 11.5h.01',
  fullscreen: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  shuffle: 'M3.5 7h3.5c5 0 5 10 10 10h3.5M17.5 14l3 3-3 3M3.5 17h3.5c1.5 0 2.5-1 3.3-2.2M13.7 9.2C14.5 8 15.5 7 17 7h3.5M17.5 4l3 3-3 3',
  signal: 'M5 19v-3M10 19v-7M15 19v-11M20 19V4',
};

export function Icon({ name, size = 20, label, class: cls }: { name: keyof typeof P | string; size?: number; label?: string; class?: string }) {
  const d = P[name] ?? P['info']!;
  const filled = name === 'play' || name === 'bolt' || name === 'star';
  return (
    <svg class={`ico ${cls ?? ''}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden={label ? undefined : 'true'} role={label ? 'img' : undefined} aria-label={label}
      fill={filled ? 'currentColor' : 'none'} stroke="currentColor" stroke-width={filled ? 1.2 : 2} stroke-linecap="round" stroke-linejoin="round">
      <path d={d} />
    </svg>
  );
}

/** Spark currency glyph (original four-point twinkle, not the Claude mark). */
export function SparkGlyph({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" class="spark-glyph">
      <path d="M12 1.5c.9 5.4 3.1 8.6 10.5 10.5-7.4 1.9-9.6 5.1-10.5 10.5-.9-5.4-3.1-8.6-10.5-10.5C8.9 10.1 11.1 6.9 12 1.5z" fill="#f2a65a" stroke="#c96442" stroke-width="1.4" stroke-linejoin="round" />
    </svg>
  );
}
