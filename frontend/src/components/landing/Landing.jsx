import { T, FF, AppMark, Blob, Star, PillBtn } from '@/components/shared/brand';

const styles = `
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(32px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }

  .fade-up {
    opacity: 0;
    animation: fadeUp 0.85s cubic-bezier(0.22, 1, 0.36, 1) forwards;
  }

  .fade-in {
    opacity: 0;
    animation: fadeIn 1s ease forwards;
  }

  .d-0  { animation-delay: 0.1s; }
  .d-1  { animation-delay: 0.35s; }
  .d-2  { animation-delay: 0.6s; }
  .d-3  { animation-delay: 0.85s; }
  .d-4  { animation-delay: 1.1s; }
  .d-5  { animation-delay: 1.35s; }
  .d-6  { animation-delay: 0.2s; }
  .d-7  { animation-delay: 0.5s; }
  .d-8  { animation-delay: 0.8s; }
`;

export default function Landing() {
  return (
    <>
      <style>{styles}</style>

      <div style={{ fontFamily: FF.sans, background: T.cream, color: T.ink, overflowX: 'hidden' }}>

        {/* ── HERO ─────────────────────────────────────────────────────────── */}
        <section style={{
          position: 'relative',
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: T.ink,
          overflow: 'hidden',
        }}>
          {/* Decorative blobs */}
          <div style={{ position: 'absolute', top: '-10%', right: '-5%', opacity: 0.15, zIndex: 0 }}>
            <Blob color={T.coral} size={320} seed={0} />
          </div>
          <div style={{ position: 'absolute', bottom: '-15%', left: '-8%', opacity: 0.12, zIndex: 0 }}>
            <Blob color={T.lilac} size={280} seed={1} />
          </div>

          {/* Hero content */}
          <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '0 24px', maxWidth: 900 }}>
            <div className="fade-up d-0">
              <AppMark size={64} shadow style={{ margin: '0 auto 48px' }} />
            </div>

            <h1
              className="fade-up d-1"
              style={{
                fontFamily: FF.serif,
                fontSize: 'clamp(2rem, 5vw, 3.5rem)',
                fontWeight: 400,
                color: '#fff',
                lineHeight: 1.2,
                marginBottom: 32,
              }}
            >
              ur schedule,<br />ur ppl.
            </h1>

            <p
              className="fade-up d-2"
              style={{
                fontSize: 'clamp(1rem, 2vw, 1.25rem)',
                color: `rgba(255,255,255,0.7)`,
                lineHeight: 1.6,
                maxWidth: 600,
                margin: '0 auto 48px',
              }}
            >
              upload a syllabus, see ur friends, snap with ur classes, actually coordinate. no more "what time is that again?"
            </p>

            <div className="fade-up d-3" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
              <a href="/register" style={{ textDecoration: 'none' }}>
                <PillBtn bg={T.coral} fg="#fff" size="md">
                  sign up free →
                </PillBtn>
              </a>
              <a href="/login" style={{ textDecoration: 'none' }}>
                <PillBtn bg="transparent" fg={T.coral} size="md" style={{ border: `2px solid ${T.coral}` }}>
                  log in
                </PillBtn>
              </a>
            </div>

            {/* Scroll hint */}
            <div
              className="fade-up d-4"
              style={{
                marginTop: 80,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 8,
                color: `rgba(255,255,255,0.4)`,
              }}
            >
              <span style={{ fontSize: '0.75rem', letterSpacing: '0.15em', textTransform: 'uppercase', fontFamily: FF.mono }}>
                scroll to explore
              </span>
              <svg width="16" height="24" viewBox="0 0 16 24" fill="none">
                <rect x="6.5" y="0.5" width="3" height="9" rx="1.5" fill="rgba(255,255,255,0.4)" />
                <path d="M8 16 L3 21 M8 16 L13 21" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        </section>

        {/* ── FEATURES ─────────────────────────────────────────────────────── */}
        <section style={{ padding: '100px 24px', background: T.cream }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <h2
              className="fade-up d-6"
              style={{
                fontFamily: FF.serif,
                fontSize: 'clamp(2rem, 4vw, 3rem)',
                fontWeight: 400,
                color: T.ink,
                marginBottom: 64,
                textAlign: 'center',
              }}
            >
              what makes timetify different
            </h2>

            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: 32,
            }}>
              {/* AI Parsing */}
              <div
                className="fade-up d-7"
                style={{
                  background: '#fff',
                  padding: 32,
                  borderRadius: 24,
                  border: `1px solid ${T.ink08}`,
                }}
              >
                <div style={{ marginBottom: 24 }}>
                  <Star color={T.coral} size={40} />
                </div>
                <h3 style={{
                  fontFamily: FF.serif,
                  fontSize: '1.3rem',
                  fontWeight: 400,
                  color: T.ink,
                  marginBottom: 12,
                }}>
                  parse ur pdf
                </h3>
                <p style={{
                  fontSize: '1rem',
                  color: T.ink60,
                  lineHeight: 1.6,
                }}>
                  dump a messy syllabus, ai extracts times, exams, assignments. done in seconds.
                </p>
              </div>

              {/* Friend Schedules */}
              <div
                className="fade-up d-8"
                style={{
                  background: '#fff',
                  padding: 32,
                  borderRadius: 24,
                  border: `1px solid ${T.ink08}`,
                }}
              >
                <div style={{ marginBottom: 24 }}>
                  <Star color={T.lilac} size={40} />
                </div>
                <h3 style={{
                  fontFamily: FF.serif,
                  fontSize: '1.3rem',
                  fontWeight: 400,
                  color: T.ink,
                  marginBottom: 12,
                }}>
                  see friends live
                </h3>
                <p style={{
                  fontSize: '1rem',
                  color: T.ink60,
                  lineHeight: 1.6,
                }}>
                  know when ur friends are in class, who's in ur courses, who's free rn. zero awkward "are u busy?"
                </p>
              </div>

              {/* Snap Feature */}
              <div
                className="fade-up d-7"
                style={{
                  background: '#fff',
                  padding: 32,
                  borderRadius: 24,
                  border: `1px solid ${T.ink08}`,
                }}
              >
                <div style={{ marginBottom: 24 }}>
                  <Star color={T.lime} size={40} />
                </div>
                <h3 style={{
                  fontFamily: FF.serif,
                  fontSize: '1.3rem',
                  fontWeight: 400,
                  color: T.ink,
                  marginBottom: 12,
                }}>
                  snap ur class
                </h3>
                <p style={{
                  fontSize: '1rem',
                  color: T.ink60,
                  lineHeight: 1.6,
                }}>
                  quick 5sec video from lecture. friends see u, engage, keep everyone connected.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────────────────────────────── */}
        <section style={{
          padding: '120px 24px',
          background: T.coral,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Decorative blobs */}
          <div style={{ position: 'absolute', top: '-10%', right: '-8%', opacity: 0.1, zIndex: 0 }}>
            <Blob color="#fff" size={280} seed={2} />
          </div>
          <div style={{ position: 'absolute', bottom: '-12%', left: '-5%', opacity: 0.08, zIndex: 0 }}>
            <Blob color="#fff" size={320} seed={3} />
          </div>

          <div style={{ position: 'relative', zIndex: 1 }}>
            <h2
              className="fade-up d-6"
              style={{
                fontFamily: FF.serif,
                fontSize: 'clamp(2rem, 5vw, 3.5rem)',
                fontWeight: 400,
                color: '#fff',
                marginBottom: 32,
              }}
            >
              ready to get ur life together?
            </h2>

            <p
              className="fade-up d-7"
              style={{
                fontSize: '1.1rem',
                color: `rgba(255,255,255,0.9)`,
                marginBottom: 48,
                maxWidth: 600,
                margin: '0 auto 48px',
              }}
            >
              join students at {/* placeholder for universities */} and never ask "what time?" again.
            </p>

            <div className="fade-up d-8" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
              <a href="/register" style={{ textDecoration: 'none' }}>
                <PillBtn bg="#fff" fg={T.coral} size="md" style={{ fontWeight: 600 }}>
                  sign up free
                </PillBtn>
              </a>
              <a href="/login" style={{ textDecoration: 'none' }}>
                <PillBtn bg="transparent" fg="#fff" size="md" style={{ border: `2px solid rgba(255,255,255,0.8)` }}>
                  log in
                </PillBtn>
              </a>
            </div>
          </div>
        </section>

      </div>
    </>
  );
}
