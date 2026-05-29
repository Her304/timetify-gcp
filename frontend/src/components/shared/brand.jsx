// Shared brand atoms — single source of truth for the timetify visual system.
// Tokens are mirrored here as JS so inline styles can read them; Tailwind users
// should prefer the matching utility classes (coral, lilac, lime, ink, cream).

export const T = {
  coral:   '#ED6A4A',
  coralDk: '#C04A2E',
  coralLt: '#F9D9CC',
  lilac:   '#C8B0DF',
  lilacDk: '#7A5BA0',
  lime:    '#C9EE6F',
  ink:     '#1F1A22',
  ink60:   'rgba(31, 26, 34, 0.6)',
  ink40:   'rgba(31, 26, 34, 0.4)',
  ink15:   'rgba(31, 26, 34, 0.15)',
  ink08:   'rgba(31, 26, 34, 0.08)',
  cream:   '#F8F4ED',
  paper:   '#FCFAF5',
};

export const FF = {
  serif: '"Bricolage Grotesque", "Inter", -apple-system, system-ui, sans-serif',
  sans:  '"Geist", -apple-system, BlinkMacSystemFont, system-ui, sans-serif',
  mono:  '"Geist Mono", ui-monospace, "SF Mono", Menlo, monospace',
};

// Avatar — colored disc with initials in display serif
export function Avatar({ name = 'mm', bg = T.lilac, fg = T.ink, size = 36, ring, style = {} }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 999, background: bg, color: fg,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: FF.serif, fontSize: size * 0.46,
      lineHeight: 1, letterSpacing: -0.5, flexShrink: 0,
      boxShadow: ring ? `0 0 0 2.5px ${ring}, 0 0 0 4.5px ${T.cream}` : 'none',
      ...style,
    }}>{name}</div>
  );
}

// ProfileAvatar — renders profilePictureUrl if present, else falls back to Avatar initials.
export function ProfileAvatar({ profilePictureUrl, name = 'mm', bg = T.lilac, fg = T.ink, size = 36, ring, style = {} }) {
  if (profilePictureUrl) {
    return (
      <img
        src={profilePictureUrl}
        alt=""
        style={{
          width: size, height: size, borderRadius: 999,
          objectFit: 'cover', objectPosition: 'top',
          flexShrink: 0, display: 'block',
          boxShadow: ring ? `0 0 0 2.5px ${ring}, 0 0 0 4.5px ${T.cream}` : 'none',
          ...style,
        }}
      />
    );
  }
  return <Avatar name={name} bg={bg} fg={fg} size={size} ring={ring} style={style} />;
}

// Sticker blob — wavy organic shape
export function Blob({ color = T.lime, size = 120, seed = 0, style = {} }) {
  const paths = [
    'M40 0 Q90 5 95 50 T55 95 Q5 90 5 50 T40 0',
    'M50 2 Q95 12 90 55 T48 96 Q4 88 8 48 T50 2',
    'M45 0 Q92 8 96 48 T58 97 Q8 92 3 52 T45 0',
    'M48 1 Q94 14 93 52 T50 98 Q6 86 6 46 T48 1',
  ];
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={style}>
      <path d={paths[seed % paths.length]} fill={color}/>
    </svg>
  );
}

// Hand-drawn underline squiggle
export function Squiggle({ color = T.coral, w = 120, h = 14, strokeWidth = 3, style = {} }) {
  return (
    <svg viewBox="0 0 120 14" width={w} height={h} style={{ display: 'block', ...style }}>
      <path d="M2 9 Q15 2 28 8 T54 8 T80 8 T118 6"
            stroke={color} strokeWidth={strokeWidth} fill="none"
            strokeLinecap="round"/>
    </svg>
  );
}

// Star sticker
export function Star({ color = T.lime, size = 22, style = {} }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} style={style}>
      <path d="M12 1 C12 7 12 7 23 12 C12 17 12 17 12 23 C12 17 12 17 1 12 C12 7 12 7 12 1Z"
            fill={color}/>
    </svg>
  );
}

// Chunky pill button
export function PillBtn({ children, bg = T.coral, fg = '#fff', size = 'md', style = {}, onClick, type = 'button', disabled = false }) {
  const pad = size === 'sm' ? '6px 12px' : size === 'lg' ? '14px 22px' : '10px 16px';
  const fs  = size === 'sm' ? 13 : size === 'lg' ? 16 : 14;
  return (
    <button type={type} onClick={onClick} disabled={disabled} style={{
      padding: pad, borderRadius: 999, background: bg, color: fg,
      fontFamily: FF.sans, fontWeight: 600, fontSize: fs, border: 'none',
      cursor: disabled ? 'not-allowed' : 'pointer', letterSpacing: -0.1, lineHeight: 1.1,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
      opacity: disabled ? 0.5 : 1,
      ...style,
    }}>{children}</button>
  );
}

// Mono caps-on label
export function MonoLabel({ children, color = T.ink60, fs = 11, ls = 1.2, style = {} }) {
  return (
    <span style={{
      fontFamily: FF.mono, fontSize: fs, color, letterSpacing: ls,
      textTransform: 'uppercase', fontWeight: 500, ...style,
    }}>{children}</span>
  );
}

// Tag / chip
export function Chip({ children, active = false, color = T.ink, bg = '#fff', dot, onClick, style = {} }) {
  return (
    <button type="button" onClick={onClick} style={{
      display: 'inline-flex', alignItems: 'center', gap: 6,
      padding: '6px 12px', borderRadius: 999,
      background: active ? T.ink : bg,
      color: active ? T.cream : color,
      fontFamily: FF.sans, fontSize: 13, fontWeight: 500,
      border: active ? 'none' : `1px solid ${T.ink15}`,
      letterSpacing: -0.1, whiteSpace: 'nowrap', cursor: onClick ? 'pointer' : 'default',
      ...style,
    }}>
      {dot && <span style={{ width: 7, height: 7, borderRadius: 999, background: dot }}/>}
      {children}
    </button>
  );
}

// iOS-style toggle. Coral when on, ink-15 when off. Sliding white knob.
export function Toggle({ checked = false, onChange, disabled = false, size = 'md', ariaLabel }) {
  const w = size === 'sm' ? 36 : 44;
  const h = size === 'sm' ? 20 : 24;
  const knob = h - 4;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => !disabled && onChange?.(!checked)}
      style={{
        width: w,
        height: h,
        borderRadius: 9999,
        background: checked ? T.coral : T.ink15,
        position: 'relative',
        transition: 'background 0.18s ease',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          display: 'block',
          width: knob,
          height: knob,
          borderRadius: 9999,
          background: '#fff',
          boxShadow: '0 1px 2px rgba(0,0,0,.15)',
          position: 'absolute',
          top: 2,
          left: checked ? w - knob - 2 : 2,
          transition: 'left 0.18s ease',
        }}
      />
    </button>
  );
}

// Single-stroke lucide-ish icon set
export const Icon = ({ name, size = 20, color = 'currentColor', stroke = 1.8, style = {} }) => {
  const p = {
    x:        'M6 6l12 12M18 6L6 18',
    chevL:    'M15 6l-6 6 6 6',
    chevR:    'M9 6l6 6-6 6',
    chevD:    'M6 9l6 6 6-6',
    chevU:    'M6 15l6-6 6 6',
    plus:     'M12 5v14M5 12h14',
    search:   'M11 4a7 7 0 100 14 7 7 0 000-14zM21 21l-5-5',
    heart:    'M12 21s-7-4.5-9.5-9.5C1 7.5 4.5 4 8 5.5 10 6.4 12 8 12 8s2-1.6 4-2.5C19.5 4 23 7.5 21.5 11.5 19 16.5 12 21 12 21z',
    msg:      'M21 12a8 8 0 01-12 7l-5 1 1-4a8 8 0 1116-4z',
    share:    'M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v14',
    bolt:     'M13 2L4 14h7l-1 8 9-12h-7l1-8z',
    cam:      'M3 8h4l2-3h6l2 3h4v11H3zM12 17a4 4 0 100-8 4 4 0 000 8z',
    flash:    'M13 2L4 14h7l-1 8 9-12h-7l1-8z',
    flip:     'M4 9V6a2 2 0 012-2h4M20 15v3a2 2 0 01-2 2h-4M16 4l4 5h-4M8 20l-4-5h4',
    settings: 'M12 8a4 4 0 100 8 4 4 0 000-8zM19.4 13a8 8 0 000-2l2-1.6-2-3.4-2.4 1a8 8 0 00-1.7-1L14.6 3h-4l-.7 3a8 8 0 00-1.7 1l-2.4-1-2 3.4L5.6 11a8 8 0 000 2L3.6 14.6l2 3.4 2.4-1a8 8 0 001.7 1l.7 3h4l.7-3a8 8 0 001.7-1l2.4 1 2-3.4z',
    calendar: 'M3 7h18v13a1 1 0 01-1 1H4a1 1 0 01-1-1zM3 7V5a1 1 0 011-1h16a1 1 0 011 1v2M8 2v4M16 2v4',
    filter:   'M3 5h18M6 12h12M10 19h4',
    sort:     'M3 6h13M3 12h9M3 18h5M17 9l4-4 4 4M21 5v14',
    user:     'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
    bell:     'M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9M10 21h4',
    lock:     'M5 11h14v10H5zM8 11V7a4 4 0 018 0v4',
    info:     'M12 22a10 10 0 100-20 10 10 0 000 20zM12 11v6M12 7h.01',
    up:       'M12 19V5M5 12l7-7 7 7',
    file:     'M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6',
    check:    'M5 13l4 4L19 7',
    edit:     'M12 20h9M4 20l4-1 11-11-3-3L5 16z',
    play:     'M6 4l14 8-14 8z',
    home:     'M3 12l9-9 9 9M5 10v10a1 1 0 001 1h4v-7h4v7h4a1 1 0 001-1V10',
    logout:   'M15 16l4-4-4-4M19 12H9M10 4H5a1 1 0 00-1 1v14a1 1 0 001 1h5',
    trash:    'M4 7h16M10 11v6M14 11v6M5 7l1 13a1 1 0 001 1h10a1 1 0 001-1l1-13M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3',
    flag:     'M4 22V4M4 4h12l-2 4 2 4H4',
    dots:     'M6 12h.01M12 12h.01M18 12h.01',
    block:    'M12 22a10 10 0 100-20 10 10 0 000 20zM4.93 4.93l14.14 14.14',
  }[name];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={name === 'play' ? color : 'none'}
         stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style}>
      <path d={p}/>
    </svg>
  );
};

// AppMark — canonical timetify app icon. Single source of truth.
// proportions locked to the 132px master from the design.
export function AppMark({ size = 64, decor, shadow = false, style = {} }) {
  const radius = size * (34 / 132);
  const tSize  = size * (110 / 132);
  const tMt    = size * (-6 / 132);
  const tMl    = size * (-2 / 132);
  const showDecor = decor === undefined ? size >= 20 : decor;
  const limeS  = size * (80 / 132);
  const lilacS = size * (64 / 132);
  return (
    <div style={{
      width: size, height: size, borderRadius: radius, background: T.coral,
      position: 'relative', overflow: 'hidden', flexShrink: 0,
      boxShadow: shadow ? `0 ${size * 0.06}px ${size * 0.18}px rgba(237,106,74,.3)` : 'none',
      ...style,
    }}>
      {showDecor && (
        <>
          <Blob color={T.lime} size={limeS} seed={2}
                style={{ position: 'absolute', bottom: -limeS * 0.275, right: -limeS * 0.225, opacity: 0.9 }}/>
          <Blob color={T.lilac} size={lilacS} seed={1}
                style={{ position: 'absolute', top: -lilacS * 0.28, left: -lilacS * 0.25, opacity: 0.95 }}/>
        </>
      )}
      <span style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: FF.serif, fontWeight: 400,
        fontSize: tSize, color: '#fff', lineHeight: 1,
        marginTop: tMt, marginLeft: tMl,
      }}>t</span>
    </div>
  );
}

// Wordmark — "timetify" in Bricolage Grotesque with coral dot on the i.
// Used in headers and the editorial logo treatment.
export function Wordmark({ size = 28, color = T.ink, dotColor = T.coral, style = {} }) {
  // dot sits over the "i" in "timetify" — letter index 5 (t-i-m-e-t-i-f-y).
  // Width is roughly size * 0.32 per letter at this letterspacing.
  const dotSize = size * 0.16;
  return (
    <span style={{ position: 'relative', display: 'inline-block', lineHeight: 1, ...style }}>
      <span style={{
        fontFamily: FF.serif, fontWeight: 400, fontSize: size, color,
        letterSpacing: size * -0.018,
      }}>timetify</span>
      <span style={{
        position: 'absolute',
        left: size * 1.04, top: size * 0.05,
        width: dotSize, height: dotSize, borderRadius: 999, background: dotColor,
      }}/>
    </span>
  );
}
