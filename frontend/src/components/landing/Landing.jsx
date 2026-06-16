import { useRef, useState } from 'react';
import {
  motion,
  useScroll,
  useTransform,
  useMotionValueEvent,
  AnimatePresence,
  useInView,
} from 'framer-motion';
const T = {
  coral: '#ED6A4A',
  lilac: '#C8B0DF',
  lime: '#C9EE6F',
  ink: '#1F1A22',
  ink60: 'rgba(31,26,34,0.6)',
  ink40: 'rgba(31,26,34,0.4)',
  ink15: 'rgba(31,26,34,0.15)',
  ink08: 'rgba(31,26,34,0.08)',
  cream: '#F8F4ED',
  paper: '#FCFAF5',
};

// ─── HERO ─────────────────────────────────────────────────────────────────────

const chatMessages = [
  { id: 1, author: 'maya', text: 'ok we NEED to actually hang out this week 😤', mine: false, at: 0.04 },
  { id: 2, author: 'alex', text: 'yes!! but i have class mon, wed, fri until 3pm', mine: false, at: 0.09 },
  { id: 3, author: 'me', text: 'same lol. and i work tues + thurs', mine: true, at: 0.13 },
  { id: 4, author: 'jayden', text: 'is friday evening free for everyone?', mine: false, at: 0.17 },
  { id: 5, author: 'priya', text: 'noooo i have lab friday until 5 😭', mine: false, at: 0.21 },
  { id: 6, author: 'alex', text: 'thursday evening then?', mine: false, at: 0.25 },
  { id: 7, author: 'me', text: 'alex i literally just said i work thursday 💀', mine: true, at: 0.29 },
];

const agreeMessages = [
  { id: 1, author: 'maya', text: 'yes!!! 🎉', mine: false, at: 0.82 },
  { id: 2, author: 'priya', text: '✅', mine: false, at: 0.85 },
  { id: 3, author: 'jayden', text: '👍🙌', mine: false, at: 0.88 },
  { id: 4, author: 'alex', text: "FINALLY. let's go", mine: false, at: 0.91 },
];

const authorColors = {
  maya: T.lilac,
  alex: '#F4A28A',
  jayden: '#CDE6D2',
  priya: T.lime,
};

const days = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const calBlocks = [
  { day: 0, start: 9, end: 15, label: 'class', color: '#E5D5F2', dotColor: T.lime },
  { day: 1, start: 10, end: 17, label: 'work', color: '#F6D9C1', dotColor: T.coral },
  { day: 2, start: 9, end: 15, label: 'class', color: '#E5D5F2', dotColor: T.lime },
  { day: 3, start: 10, end: 17, label: 'work', color: '#F6D9C1', dotColor: T.coral },
  { day: 4, start: 9, end: 15, label: 'class', color: '#E5D5F2', dotColor: T.lime },
  { day: 4, start: 15, end: 19, label: 'lab', color: '#DCF5A9', dotColor: '#3F5E14' },
  { day: 6, start: 12, end: 14, label: 'brunch 🥞', color: '#F4A28A', dotColor: T.ink },
];

const hangoutBlock = { day: 5, start: 16, end: 19, label: 'hangout! 🎉', isEvent: true };

const MIN_H = 8;
const MAX_H = 20;
const TOTAL_H = MAX_H - MIN_H;
const CELL_PX = 36;

function hourLabel(h) {
  if (h === 12) return '12pm';
  if (h < 12) return `${h}am`;
  return `${h - 12}pm`;
}

function TimetableView({ blockReveal, hangoutReveal }) {
  return (
    <div
      style={{
        background: T.paper,
        borderRadius: 18,
        overflow: 'hidden',
        border: `1px solid ${T.ink15}`,
        boxShadow: '0 8px 40px rgba(31,26,34,0.12)',
        width: '100%',
        maxWidth: 700,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: `1px solid ${T.ink08}` }}>
        <div style={{ width: 26, height: 26, borderRadius: 8, background: T.coral, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: "'Bricolage Grotesque', sans-serif", color: '#fff', fontSize: 15, fontWeight: 500, lineHeight: 1 }}>t</span>
        </div>
        <span style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 14, fontWeight: 500, color: T.ink }}>timetify</span>
        <span style={{ marginLeft: 'auto', fontFamily: "'Geist Mono', monospace", fontSize: 9, color: T.ink40, letterSpacing: 1, textTransform: 'uppercase' }}>this week</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '36px repeat(7, 1fr)', padding: '0 10px' }}>
        <div />
        {days.map((d, i) => (
          <div
            key={d}
            style={{
              textAlign: 'center',
              padding: '8px 0 6px',
              fontFamily: "'Geist Mono', monospace",
              fontSize: 9,
              fontWeight: 500,
              letterSpacing: 1.2,
              color: i === 5 ? T.coral : T.ink40,
              textTransform: 'uppercase',
            }}
          >
            {d}
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '36px repeat(7, 1fr)',
          padding: '0 10px 10px',
          position: 'relative',
          height: TOTAL_H * CELL_PX,
        }}
      >
        <div style={{ position: 'relative' }}>
          {[8, 10, 12, 14, 16, 18, 20].map((h) => (
            <div
              key={h}
              style={{
                position: 'absolute',
                top: (h - MIN_H) * CELL_PX - 6,
                right: 6,
                fontFamily: "'Geist Mono', monospace",
                fontSize: 8,
                color: T.ink40,
                letterSpacing: 0.4,
                whiteSpace: 'nowrap',
              }}
            >
              {hourLabel(h)}
            </div>
          ))}
        </div>

        {[8, 10, 12, 14, 16, 18, 20].map((h) => (
          <div
            key={h}
            style={{
              position: 'absolute',
              left: 36,
              right: 10,
              top: (h - MIN_H) * CELL_PX,
              height: 1,
              background: T.ink08,
            }}
          />
        ))}

        {days.map((_, di) => (
          <div key={di} style={{ position: 'relative' }}>
            {calBlocks
              .filter((b) => b.day === di)
              .map((b, bi) => {
                const top = (b.start - MIN_H) * CELL_PX;
                const h = (b.end - b.start) * CELL_PX - 2;
                return (
                  <motion.div
                    key={bi}
                    initial={{ scaleY: 0, opacity: 0 }}
                    animate={{ scaleY: blockReveal > 0.1 ? 1 : 0, opacity: blockReveal > 0.1 ? 1 : 0 }}
                    transition={{ duration: 0.45, delay: di * 0.07 + bi * 0.03, ease: [0.22, 1, 0.36, 1] }}
                    style={{
                      position: 'absolute',
                      left: 2,
                      right: 2,
                      top,
                      height: h,
                      borderRadius: 6,
                      background: b.color,
                      padding: '4px 5px',
                      overflow: 'hidden',
                      transformOrigin: 'top center',
                    }}
                  >
                    <div style={{ fontFamily: "'Geist', sans-serif", fontSize: 9, fontWeight: 600, color: T.ink, lineHeight: 1.2, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                      {b.label}
                    </div>
                  </motion.div>
                );
              })}

            {di === hangoutBlock.day && (
              <motion.div
                initial={{ scaleY: 0, opacity: 0 }}
                animate={{ scaleY: hangoutReveal > 0.05 ? 1 : 0, opacity: hangoutReveal > 0.05 ? 1 : 0 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  position: 'absolute',
                  left: 2,
                  right: 2,
                  top: (hangoutBlock.start - MIN_H) * CELL_PX,
                  height: (hangoutBlock.end - hangoutBlock.start) * CELL_PX - 2,
                  borderRadius: 6,
                  background: T.coral,
                  padding: '6px 5px',
                  transformOrigin: 'top center',
                  boxShadow: '0 4px 14px rgba(237,106,74,0.4)',
                  zIndex: 2,
                }}
              >
                <div style={{ fontFamily: "'Geist', sans-serif", fontSize: 10, fontWeight: 600, color: '#fff', lineHeight: 1.2 }}>
                  {hangoutBlock.label}
                </div>
                <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 8, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
                  4pm – 7pm
                </div>
              </motion.div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function HeroSection() {
  const containerRef = useRef(null);
  const [progress, setProgress] = useState(0);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  const animProgress = useTransform(scrollYProgress, [0, 0.85, 1], [0, 1, 1]);
  const heroExitOpacity = useTransform(scrollYProgress, [0.85, 1], [1, 0]);

  // Dark backdrop during the chaotic chat, brightening to cream as timetable resolves.
  const heroBg = useTransform(animProgress, [0.50, 0.62], [T.ink, T.cream]);
  const hintColor = useTransform(animProgress, [0.50, 0.62], ['rgba(248,244,237,0.55)', 'rgba(31,26,34,0.4)']);

  // "we all suffer..." h1 bridges chat → timetable on the dark background.
  const interstitialOpacity = useTransform(animProgress, [0.36, 0.44, 0.54, 0.60], [0, 1, 1, 0]);
  const interstitialY = useTransform(animProgress, [0.36, 0.44], ['24px', '0px']);

  useMotionValueEvent(animProgress, 'change', (v) => setProgress(v));

  const chatOpacity = useTransform(animProgress, [0.33, 0.41], [1, 0]);
  const chatY = useTransform(animProgress, [0.33, 0.41], ['0px', '-48px']);

  // Table layer container fades in
  const tableOpacity = useTransform(animProgress, [0.62, 0.68], [0, 1]);
  const tableScaleY = useTransform(animProgress, [0.62, 0.68], [0.04, 1]);

  // 1. Wordmark appears first
  const wordmarkOpacity = useTransform(animProgress, [0.64, 0.70], [0, 1]);
  const wordmarkY = useTransform(animProgress, [0.64, 0.70], ['16px', '0px']);

  // 2. Timetable slides up after wordmark (~1s scroll gap)
  const timetableOpacity = useTransform(animProgress, [0.71, 0.77], [0, 1]);
  const timetableY = useTransform(animProgress, [0.71, 0.77], ['24px', '0px']);

  // 3. Chatroom slides up after timetable
  const myMsgOpacity = useTransform(animProgress, [0.79, 0.85], [0, 1]);
  const myMsgY = useTransform(animProgress, [0.79, 0.85], ['24px', '0px']);

  const blockReveal = Math.max(0, Math.min(1, (progress - 0.73) / 0.08));
  const hangoutReveal = Math.max(0, Math.min(1, (progress - 0.80) / 0.05));

  const visibleChat = chatMessages.filter((m) => progress >= m.at);
  const visibleAgree = agreeMessages.filter((m) => progress >= m.at);

  const showChat = progress < 0.50;
  const showTable = progress > 0.60;


  return (
    <div ref={containerRef} style={{ height: '580vh', position: 'relative' }}>
      <motion.div
        style={{
          position: 'sticky',
          top: 0,
          height: '100vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: heroBg,
          opacity: heroExitOpacity,
        }}
      >
        {/* background blobs */}
        <div style={{ position: 'absolute', top: '8%', right: '7%', width: 280, height: 280, borderRadius: '60% 40% 55% 45%', background: T.lime, opacity: 0.15, filter: 'blur(48px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '12%', left: '5%', width: 220, height: 220, borderRadius: '45% 55% 60% 40%', background: T.lilac, opacity: 0.2, filter: 'blur(36px)', pointerEvents: 'none' }} />


        {/* ── INTERSTITIAL H1 (bridge between chat & timetable) ── */}
        <motion.div
          style={{
            opacity: interstitialOpacity,
            y: interstitialY,
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '80px 32px',
            pointerEvents: 'none',
          }}
        >
          <div style={{ textAlign: 'center', maxWidth: 880 }}>
            <div
              style={{
                fontFamily: "'Geist Mono', monospace",
                fontSize: 11,
                letterSpacing: 2,
                textTransform: 'uppercase',
                color: 'rgba(248,244,237,0.45)',
                marginBottom: 18,
              }}
            >
              every. single. week.
            </div>
            <h1
              style={{
                fontFamily: "'Bricolage Grotesque', sans-serif",
                fontSize: 'clamp(34px, 5.5vw, 64px)',
                fontWeight: 400,
                color: T.cream,
                letterSpacing: '-1.5px',
                lineHeight: 1.08,
                margin: 0,
              }}
            >
              we all suffer from{' '}
              <span style={{ color: T.coral }}>coming up a free timeslot</span>.
            </h1>
          </div>
        </motion.div>

        {/* ── CHAT LAYER ── */}
        <motion.div
          style={{
            opacity: chatOpacity,
            y: chatY,
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '80px 20px 40px',
            pointerEvents: showChat ? 'auto' : 'none',
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 420,
              background: T.paper,
              borderRadius: 24,
              boxShadow: '0 8px 48px rgba(31,26,34,0.12)',
              border: `1px solid ${T.ink15}`,
              overflow: 'hidden',
            }}
          >
            {/* chat header */}
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.ink08}`, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ display: 'flex', position: 'relative', width: 38, height: 24, flexShrink: 0 }}>
                {['maya', 'alex', 'jayden'].map((name, i) => (
                  <div
                    key={name}
                    style={{
                      position: 'absolute',
                      width: 24,
                      height: 24,
                      borderRadius: '50%',
                      background: authorColors[name],
                      border: `2px solid ${T.paper}`,
                      left: i * 11,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontFamily: "'Bricolage Grotesque', sans-serif",
                      fontSize: 9,
                      fontWeight: 600,
                      color: T.ink,
                      zIndex: 3 - i,
                    }}
                  >
                    {name[0]}
                  </div>
                ))}
              </div>
              <div>
                <div style={{ fontFamily: "'Geist', sans-serif", fontSize: 13, fontWeight: 600, color: T.ink, lineHeight: 1.2 }}>the crew 🤙</div>
                <div style={{ fontFamily: "'Geist', sans-serif", fontSize: 10, color: T.ink40 }}>maya, alex, jayden, priya</div>
              </div>
            </div>

            {/* messages */}
            <div
              style={{
                padding: '10px 12px',
                minHeight: 300,
                maxHeight: 400,
                display: 'flex',
                flexDirection: 'column',
                gap: 5,
                overflowY: 'hidden',
                justifyContent: 'flex-end',
              }}
            >
              <AnimatePresence initial={false}>
                {visibleChat.map((msg) => (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: msg.mine ? 'flex-end' : 'flex-start' }}
                  >
                    {!msg.mine && (
                      <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 8, color: T.ink40, letterSpacing: 0.5, marginBottom: 2, marginLeft: 2 }}>
                        {msg.author}
                      </div>
                    )}
                    <div
                      style={{
                        background: msg.mine ? T.coral : T.ink08,
                        color: msg.mine ? '#fff' : T.ink,
                        borderRadius: msg.mine ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                        padding: '7px 12px',
                        fontFamily: "'Geist', sans-serif",
                        fontSize: 13,
                        lineHeight: 1.45,
                        maxWidth: '80%',
                      }}
                    >
                      {msg.text}
                    </div>
                  </motion.div>
                ))}

              </AnimatePresence>

              {visibleChat.length === 0 && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: T.ink40, fontFamily: "'Geist', sans-serif", fontSize: 13 }}>
                  scroll down ↓
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* ── TIMETABLE + AGREEMENT LAYER ── */}
        <motion.div
          style={{
            opacity: tableOpacity,
            scaleY: tableScaleY,
            transformOrigin: 'center center',
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '80px 20px 32px',
            gap: 16,
            pointerEvents: showTable ? 'auto' : 'none',
          }}
        >
          {/* wordmark */}
          <motion.div style={{ opacity: wordmarkOpacity, y: wordmarkY, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <img src="/favicon.svg" width={36} height={36} alt="" style={{ borderRadius: 10 }} />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 32, fontWeight: 400, color: T.ink, letterSpacing: '-1px', lineHeight: 1 }}>
                timetify
              </span>
              <span style={{ fontFamily: "'Geist', sans-serif", fontSize: 13, color: T.ink60, letterSpacing: '-0.1px' }}>
                stop the thread. find a time in seconds.
              </span>
            </div>
          </motion.div>

          {/* timetable + chatroom (side-by-side) */}
          <div
            style={{
              display: 'flex',
              gap: 20,
              width: '100%',
              maxWidth: 1080,
              alignItems: 'stretch',
              justifyContent: 'center',
              flexShrink: 1,
              minHeight: 0,
            }}
          >
            <motion.div style={{ flex: '1 1 660px', minWidth: 0, opacity: timetableOpacity, y: timetableY }}>
              <TimetableView blockReveal={blockReveal} hangoutReveal={hangoutReveal} />
            </motion.div>

            <motion.div
              style={{
                opacity: myMsgOpacity,
                y: myMsgY,
                flex: '0 0 300px',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  background: T.paper,
                  borderRadius: 16,
                  border: `1px solid ${T.ink15}`,
                  boxShadow: '0 8px 28px rgba(31,26,34,0.08)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column',
                  flex: 1,
                }}
              >
                {/* chat header */}
                <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.ink08}`, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ display: 'flex', position: 'relative', width: 34, height: 22, flexShrink: 0 }}>
                    {['maya', 'alex', 'jayden'].map((name, i) => (
                      <div
                        key={name}
                        style={{
                          position: 'absolute',
                          width: 22,
                          height: 22,
                          borderRadius: '50%',
                          background: authorColors[name],
                          border: `2px solid ${T.paper}`,
                          left: i * 10,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontFamily: "'Bricolage Grotesque', sans-serif",
                          fontSize: 8,
                          fontWeight: 600,
                          color: T.ink,
                          zIndex: 3 - i,
                        }}
                      >
                        {name[0]}
                      </div>
                    ))}
                  </div>
                  <div style={{ fontFamily: "'Geist', sans-serif", fontSize: 12, fontWeight: 600, color: T.ink, lineHeight: 1.2 }}>the crew 🤙</div>
                </div>

                <div
                  style={{
                    padding: '12px 14px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    flex: 1,
                  }}
                >
                  {/* "me" message */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    <div
                      style={{
                        background: T.coral,
                        color: '#fff',
                        borderRadius: '16px 16px 4px 16px',
                        padding: '7px 12px',
                        fontFamily: "'Geist', sans-serif",
                        fontSize: 12.5,
                        lineHeight: 1.45,
                        maxWidth: '85%',
                      }}
                    >
                      saturday 4pm good for everyone? 🤞
                    </div>
                  </div>

                  {/* agreement messages — same style as before-chat */}
                  <AnimatePresence initial={false}>
                    {visibleAgree.map((msg) => (
                      <motion.div
                        key={msg.id}
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        transition={{ type: 'spring', stiffness: 380, damping: 26 }}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}
                      >
                        <div style={{ fontFamily: "'Geist Mono', monospace", fontSize: 8, color: T.ink40, letterSpacing: 0.5, marginBottom: 2, marginLeft: 2 }}>
                          {msg.author}
                        </div>
                        <div style={{
                          background: T.ink08,
                          color: T.ink,
                          borderRadius: '16px 16px 16px 4px',
                          padding: '7px 12px',
                          fontFamily: "'Geist', sans-serif",
                          fontSize: 12.5,
                          lineHeight: 1.45,
                          maxWidth: '85%',
                        }}>
                          {msg.text}
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {progress >= 0.93 && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: 0.15 }}
                      style={{
                        alignSelf: 'center',
                        marginTop: 20,
                        background: T.lime,
                        borderRadius: 99,
                        padding: '6px 16px',
                        fontFamily: "'Geist', sans-serif",
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#3F5E14',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#3F5E14', display: 'inline-block' }} />
                      all going
                    </motion.div>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}

// ─── FEATURES ─────────────────────────────────────────────────────────────────

const features = [
  {
    icon: '🗓️',
    title: 'find a time, fast',
    desc: "timetify looks at everyone's schedule and surfaces the slots that work. no more \"when are you free?\" threads.",
    accent: T.coral,
    accentBg: '#FFF0EB',
  },
  {
    icon: '📨',
    title: 'send the invite',
    desc: "create an event and invite friends in seconds. they get a notification, accept or decline, and you're done.",
    accent: T.lilac,
    accentBg: '#F2ECFA',
  },
  {
    icon: '💬',
    title: 'chat comes built in',
    desc: 'every event gets a group chat. coordinate logistics, share the vibe, hype each other up — all in one place.',
    accent: '#7A5BA0',
    accentBg: '#F0EAFA',
  },
  {
    icon: '🟢',
    title: "see who's free now",
    desc: "a live dot next to friends' names shows when they're between classes or have a free block. spontaneous plans, easy.",
    accent: '#3F5E14',
    accentBg: '#F2FAE0',
  },
  {
    icon: '📸',
    title: 'snap your moments',
    desc: 'share quick photo and video snaps with friends. they live in your class and friend groups — no algorithm, just your crew.',
    accent: '#5A3A85',
    accentBg: '#EFE8FA',
  },
];

function FeatureCard({ feature, index }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, delay: index * 0.08, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ boxShadow: '0 8px 32px rgba(31,26,34,0.1)', y: -2 }}
      style={{
        background: T.paper,
        borderRadius: 20,
        padding: '28px 28px',
        border: `1px solid ${T.ink15}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        transition: 'box-shadow 0.2s',
        cursor: 'default',
      }}
    >
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          background: feature.accentBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 24,
        }}
      >
        {feature.icon}
      </div>
      <div>
        <div
          style={{
            fontFamily: "'Bricolage Grotesque', sans-serif",
            fontSize: 20,
            fontWeight: 500,
            color: T.ink,
            letterSpacing: '-0.3px',
            lineHeight: 1.2,
            marginBottom: 6,
          }}
        >
          {feature.title}
        </div>
        <p style={{ fontFamily: "'Geist', sans-serif", fontSize: 14, color: T.ink60, lineHeight: 1.55, margin: 0 }}>
          {feature.desc}
        </p>
      </div>
    </motion.div>
  );
}

function MiniScheduleDemo() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });

  const friends = [
    { name: 'maya', color: '#C8B0DF', free: true },
    { name: 'alex', color: '#F4A28A', free: false },
    { name: 'jayden', color: '#CDE6D2', free: true },
    { name: 'priya', color: '#C9EE6F', free: true },
    { name: 'sam', color: '#F6D9C1', free: false },
  ];

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      style={{
        background: T.paper,
        borderRadius: 20,
        border: `1px solid ${T.ink15}`,
        padding: 24,
        maxWidth: 360,
        margin: '0 auto',
      }}
    >
      <div
        style={{
          fontFamily: "'Geist Mono', monospace",
          fontSize: 10,
          letterSpacing: 1.2,
          color: T.ink40,
          textTransform: 'uppercase',
          marginBottom: 14,
        }}
      >
        free right now
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {friends.map((f, i) => (
          <motion.div
            key={f.name}
            initial={{ opacity: 0, x: -10 }}
            animate={inView ? { opacity: 1, x: 0 } : {}}
            transition={{ delay: 0.1 + i * 0.07, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            style={{ display: 'flex', alignItems: 'center', gap: 10 }}
          >
            <div style={{ position: 'relative' }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '50%',
                  background: f.color,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: "'Bricolage Grotesque', sans-serif",
                  fontSize: 14,
                  fontWeight: 600,
                  color: T.ink,
                }}
              >
                {f.name[0]}
              </div>
              {f.free && (
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ repeat: Infinity, duration: 2, delay: i * 0.3 }}
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: T.lime,
                    border: `2px solid ${T.paper}`,
                  }}
                />
              )}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "'Geist', sans-serif", fontSize: 14, fontWeight: 500, color: T.ink, lineHeight: 1.2 }}>
                {f.name}
              </div>
              <div style={{ fontFamily: "'Geist', sans-serif", fontSize: 11, color: f.free ? '#3F5E14' : T.ink40 }}>
                {f.free ? 'free until 3pm' : 'in class'}
              </div>
            </div>
            {f.free && (
              <div
                style={{
                  background: '#F2FAE0',
                  borderRadius: 99,
                  padding: '3px 10px',
                  fontFamily: "'Geist', sans-serif",
                  fontSize: 11,
                  color: '#3F5E14',
                  fontWeight: 500,
                }}
              >
                free
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

function FeaturesSection() {
  const headRef = useRef(null);
  const headInView = useInView(headRef, { once: true, margin: '-40px' });

  return (
    <section style={{ background: T.cream, padding: '100px 24px 120px' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        <motion.div
          ref={headRef}
          initial={{ opacity: 0, y: 24 }}
          animate={headInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          style={{ marginBottom: 64, textAlign: 'center' }}
        >
          <div
            style={{
              display: 'inline-block',
              background: '#FFF0EB',
              borderRadius: 99,
              padding: '4px 14px',
              fontFamily: "'Geist Mono', monospace",
              fontSize: 10,
              letterSpacing: 1.2,
              color: T.coral,
              textTransform: 'uppercase',
              marginBottom: 16,
            }}
          >
            what timetify does
          </div>
          <h2
            style={{
              fontFamily: "'Bricolage Grotesque', sans-serif",
              fontSize: 'clamp(32px, 5vw, 52px)',
              fontWeight: 400,
              color: T.ink,
              letterSpacing: '-1.5px',
              lineHeight: 1.1,
              margin: '0 0 16px',
            }}
          >
            scheduling, without the chaos
          </h2>
          <p style={{ fontFamily: "'Geist', sans-serif", fontSize: 17, color: T.ink60, lineHeight: 1.55, maxWidth: 500, margin: '0 auto' }}>
            timetify connects your schedule with your friends' — so you spend less time coordinating and more time actually hanging out.
          </p>
        </motion.div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 16,
            marginBottom: 64,
          }}
        >
          {features.map((f, i) => (
            <FeatureCard key={f.title} feature={f} index={i} />
          ))}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 40,
            alignItems: 'center',
          }}
        >
          <div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            >
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: T.lime,
                  marginBottom: 16,
                  boxShadow: '0 0 0 4px rgba(201,238,111,0.25)',
                }}
              />
              <h3
                style={{
                  fontFamily: "'Bricolage Grotesque', sans-serif",
                  fontSize: 'clamp(24px, 3.5vw, 36px)',
                  fontWeight: 400,
                  color: T.ink,
                  letterSpacing: '-0.8px',
                  lineHeight: 1.15,
                  margin: '0 0 14px',
                }}
              >
                know when your people are free
              </h3>
              <p style={{ fontFamily: "'Geist', sans-serif", fontSize: 15, color: T.ink60, lineHeight: 1.6, margin: 0 }}>
                a live green dot shows up when friends have a gap in their schedule.
                no more "you free?" texts — just see it, and make plans.
              </p>
            </motion.div>
          </div>
          <MiniScheduleDemo />
        </div>
      </div>
    </section>
  );
}

// ─── CTA ──────────────────────────────────────────────────────────────────────

function CtaSection() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-60px' });

  return (
    <section
      style={{
        padding: '120px 24px',
        background: T.coral,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <div style={{ position: 'absolute', top: '-10%', right: '-8%', width: 320, height: 320, borderRadius: '60% 40% 55% 45%', background: '#fff', opacity: 0.06, filter: 'blur(48px)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', bottom: '-12%', left: '-5%', width: 280, height: 280, borderRadius: '45% 55% 60% 40%', background: '#fff', opacity: 0.05, filter: 'blur(40px)', pointerEvents: 'none' }} />

      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 24 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        style={{ position: 'relative', zIndex: 1 }}
      >
        <h2
          style={{
            fontFamily: "'Bricolage Grotesque', sans-serif",
            fontSize: 'clamp(2rem, 5vw, 3.5rem)',
            fontWeight: 400,
            color: '#fff',
            letterSpacing: '-1.5px',
            marginBottom: 20,
          }}
        >
          ready to stop the thread?
        </h2>
        <p style={{ fontFamily: "'Geist', sans-serif", fontSize: '1.1rem', color: 'rgba(255,255,255,0.85)', marginBottom: 48, maxWidth: 480, margin: '0 auto 48px' }}>
          join students and actually coordinate. no more "what time?" group chats.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
          <a href="/register" style={{ textDecoration: 'none' }}>
            <button
              style={{
                background: '#fff',
                color: T.coral,
                border: 'none',
                borderRadius: 999,
                padding: '12px 28px',
                fontFamily: "'Geist', sans-serif",
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              sign up free
            </button>
          </a>
          <a href="/login" style={{ textDecoration: 'none' }}>
            <button
              style={{
                background: 'transparent',
                color: '#fff',
                border: '2px solid rgba(255,255,255,0.7)',
                borderRadius: 999,
                padding: '12px 28px',
                fontFamily: "'Geist', sans-serif",
                fontSize: 15,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              log in
            </button>
          </a>
        </div>
      </motion.div>
    </section>
  );
}

// ─── LANDING ─────────────────────────────────────────────────────────────────

export default function Landing() {
  return (
    <div style={{ fontFamily: "'Geist', sans-serif", background: T.cream, color: T.ink }}>
      <HeroSection />
      <FeaturesSection />
      <CtaSection />
    </div>
  );
}
