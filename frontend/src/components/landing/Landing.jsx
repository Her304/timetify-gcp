import nateSmithImg from '../../assets/nate-smith-Qw_u8x5XS68-unsplash.jpg';
import screenshotImg from '../../assets/Screenshot 2026-03-29 at 07.57.08.png';
import jedVillejoImg from '../../assets/jed-villejo-bEcC0nyIp2g-unsplash.jpg';

/*
  All animation is done with pure CSS keyframes injected via a <style> tag.
  Every section fades + rises in on page load with staggered delays.
  Zero scroll logic, zero Framer Motion, zero external dependencies.
*/

const styles = `

  :root {
    --brand: #607196;
    --brand-dark: #4a5a7a;
    --text: #1a1a2e;
    --muted: #6b7280;
    --bg: #ffffff;
    --bg-soft: #f8f8f6;
  }

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

  /* Staggered delays */
  .d-0  { animation-delay: 0.1s; }
  .d-1  { animation-delay: 0.35s; }
  .d-2  { animation-delay: 0.6s; }
  .d-3  { animation-delay: 0.85s; }
  .d-4  { animation-delay: 1.1s; }
  .d-5  { animation-delay: 1.35s; }
  .d-6  { animation-delay: 0.2s; }
  .d-7  { animation-delay: 0.5s; }
  .d-8  { animation-delay: 0.8s; }

  /* Section-level stagger resets (applied via parent class) */
  .section-anim .fade-up,
  .section-anim .fade-in {
    animation-play-state: paused;
  }
  .section-anim.in-view .fade-up,
  .section-anim.in-view .fade-in {
    animation-play-state: running;
  }
`;

export default function Landing() {
  return (
    <>
      <style>{styles}</style>

      <div style={{ fontFamily: "'DM Sans', sans-serif", background: 'var(--bg)', color: 'var(--text)', overflowX: 'hidden' }}>

        {/* ── HERO ─────────────────────────────────────────────────────────── */}
        <section style={{ position: 'relative', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* Background image */}
          <div className="fade-in d-0" style={{ position: 'absolute', inset: 0 }}>
            <img
              src={nateSmithImg}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'brightness(0.42)' }}
            />
          </div>

          {/* Hero text */}
          <div style={{ position: 'relative', zIndex: 1, textAlign: 'center', padding: '0 24px', maxWidth: 860 }}>
            <p
              className="fade-up d-1"
              style={{
                fontFamily: "'Instrument Serif', serif",
                fontStyle: 'italic',
                fontSize: 'clamp(1rem, 2vw, 1.25rem)',
                color: 'rgba(255,255,255,0.6)',
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                marginBottom: 32,
              }}
            >
              Student life, simplified
            </p>

            <h1
              className="fade-up d-2"
              style={{
                fontSize: 'clamp(1.6rem, 4vw, 3rem)',
                fontWeight: 600,
                color: '#fff',
                lineHeight: 1.45,
                marginBottom: 0,
              }}
            >
              No more <br /><em style={{ fontFamily: "'Instrument Serif', serif", fontStyle: 'italic', fontWeight: 400 }}>"What class am I supposed to be at?"</em>
            </h1>

            <h1
              className="fade-up d-3"
              style={{
                fontSize: 'clamp(1.6rem, 4vw, 3rem)',
                fontWeight: 600,
                color: '#fff',
                lineHeight: 1.45,
                margin: '18px 0',
              }}
            >
              <em style={{ fontFamily: "'Instrument Serif', serif", fontStyle: 'italic', fontWeight: 400 }}>"Guys, can we find a time slot?"</em>
            </h1>

            <h1
              className="fade-up d-4"
              style={{
                fontSize: 'clamp(1.6rem, 4vw, 3rem)',
                fontWeight: 600,
                color: '#fff',
                lineHeight: 1.45,
                marginBottom: 0,
              }}
            >
              <em style={{ fontFamily: "'Instrument Serif', serif", fontStyle: 'italic', fontWeight: 400 }}>"When are you guys free to hang out?"</em>
            </h1>

            {/* Scroll hint */}
            <div
              className="fade-up d-5"
              style={{ marginTop: 64, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.4)' }}
            >
              <span style={{ fontSize: '0.75rem', letterSpacing: '0.15em', textTransform: 'uppercase' }}>Scroll to explore</span>
              <svg width="16" height="24" viewBox="0 0 16 24" fill="none">
                <rect x="6.5" y="0.5" width="3" height="9" rx="1.5" fill="rgba(255,255,255,0.4)" />
                <path d="M8 16 L3 21 M8 16 L13 21" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
          </div>
        </section>

        {/* ── BRAND MESSAGE ────────────────────────────────────────────────── */}
        <section style={{
          padding: '120px 24px',
          background: 'var(--bg)',
          display: 'flex',
          justifyContent: 'center',
        }}>
          <h2
            className="fade-up d-6"
            style={{
              fontFamily: "'Instrument Serif', serif",
              fontSize: 'clamp(2rem, 5vw, 4.5rem)',
              fontWeight: 400,
              color: 'var(--text)',
              textAlign: 'center',
              maxWidth: 900,
              lineHeight: 1.25,
            }}
          >
            With <span style={{ color: '#607196', fontStyle: 'italic' }}>Timetify</span>, all your schedules are{' '}
            <span style={{ color: '#ffc759', fontStyle: 'italic' }}>organized</span>{' '}
            and{' '}
            <span style={{ color: '#ffc759', fontStyle: 'italic' }}>shared.</span>
          </h2>
        </section>

        {/* ── AI FEATURE — screenshot left, text right ─────────────────────── */}
        <section style={{ background: 'var(--bg-soft)', padding: '100px 24px' }}>
          <div style={{
            maxWidth: 1100,
            margin: '0 auto',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 56,
          }}>
            {/* Screenshot — LEFT */}
            <div className="fade-up d-6" style={{ flex: '1 1 420px', minWidth: 0 }}>
              <img
                src={screenshotImg}
                alt="Timetify app screenshot"
                style={{
                  width: '100%',
                  borderRadius: 20,
                  boxShadow: '0 24px 64px rgba(0,0,0,0.12)',
                  border: '1px solid rgba(0,0,0,0.06)',
                  display: 'block',
                }}
              />
            </div>

            {/* Text — RIGHT */}
            <div className="fade-up d-7" style={{ flex: '1 1 360px', minWidth: 0 }}>
              <div style={{ width: 40, height: 3, background: 'var(--brand)', borderRadius: 2, marginBottom: 28 }} />
              <h3 style={{
                fontFamily: "'Instrument Serif', serif",
                fontSize: 'clamp(1.6rem, 3vw, 2.6rem)',
                fontWeight: 400,
                lineHeight: 1.3,
                marginBottom: 20,
                color: 'var(--text)',
              }}>
                Upload your messy syllabus PDF
              </h3>
              <p style={{
                fontSize: 'clamp(1rem, 1.5vw, 1.2rem)',
                color: 'var(--muted)',
                lineHeight: 1.8,
                fontWeight: 300,
              }}>
                Let AI handle the rest — extracting lecture times, lab sessions, weekly topics,
                assignments, and exam dates like magic.{' '}
                <strong style={{ color: 'var(--text)', fontWeight: 600 }}>No more panic-scrolling</strong>{' '}
                through 12-page PDFs at 2 a.m.
              </p>
            </div>
          </div>
        </section>

        {/* ── SOCIAL FEATURE — full-bleed image with text overlay ──────────── */}
        <section style={{ position: 'relative', minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {/* Background image */}
          <div className="fade-in d-6" style={{ position: 'absolute', inset: 0 }}>
            <img
              src={jedVillejoImg}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
            <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,12,30,0.58)', backdropFilter: 'blur(1px)' }} />
          </div>

          <div
            className="fade-up d-7"
            style={{
              position: 'relative',
              zIndex: 1,
              textAlign: 'center',
              maxWidth: 760,
              padding: '80px 24px',
            }}
          >
            <p style={{
              fontFamily: "'Instrument Serif', serif",
              fontStyle: 'italic',
              fontSize: 'clamp(0.85rem, 1.5vw, 1rem)',
              color: 'rgba(255,255,255,0.5)',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              marginBottom: 24,
            }}>
              Connect & Coordinate
            </p>
            <p style={{
              fontSize: 'clamp(1.2rem, 2.5vw, 1.9rem)',
              color: '#fff',
              lineHeight: 1.65,
              fontWeight: 300,
            }}>
              See which friends are in your classes, connect easily, and actually enjoy
              the semester together.{' '}
              <strong style={{ fontWeight: 600 }}>Group projects?</strong> Simple.
              Finding someone to study with? Even easier.
            </p>
          </div>
        </section>

        {/* ── CTA ──────────────────────────────────────────────────────────── */}
        <section style={{
          padding: '140px 24px',
          background: 'var(--bg)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          borderTop: '1px solid #f0f0f0',
        }}>
          <p
            className="fade-up d-6 !text-[#ffc759]"
            style={{
              fontSize: 'clamp(1rem, 2vw, 1.3rem)',
              color: 'var(--muted)',
              fontStyle: 'italic',
              fontFamily: "'Instrument Serif', serif",
              marginBottom: 16,
            }}
          >
            Asking about schedules?
          </p>

          <h1
            className="fade-up d-7"
            style={{
              fontFamily: "'Instrument Serif', serif",
              fontSize: 'clamp(4rem, 14vw, 10rem)',
              fontWeight: 400,
              color: 'var(--brand)',
              lineHeight: 1,
              marginBottom: 56,
              letterSpacing: '-0.02em',
            }}
          >
            Timetify
          </h1>

          <div className="fade-up d-8" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, justifyContent: 'center' }}>
            <a
              href="/register"
              style={{
                padding: '14px 40px',
                background: 'var(--brand)',
                color: '#fff',
                fontWeight: 700,
                borderRadius: 9999,
                fontSize: '1rem',
                textDecoration: 'none',
                transition: 'all 0.2s',
                boxShadow: '0 8px 24px rgba(96,113,150,0.28)',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--brand-dark)'; e.currentTarget.style.transform = 'scale(1.04)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'var(--brand)'; e.currentTarget.style.transform = 'scale(1)'; }}
            >
              Join Timetify Now
            </a>
            <a
              href="/login"
              style={{
                padding: '14px 40px',
                background: 'transparent',
                color: 'var(--brand)',
                border: '2px solid var(--brand)',
                fontWeight: 700,
                borderRadius: 9999,
                fontSize: '1rem',
                textDecoration: 'none',
                transition: 'all 0.2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = '#f4f6fb'; e.currentTarget.style.transform = 'scale(1.04)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.transform = 'scale(1)'; }}
            >
              Welcome Back
            </a>
          </div>
        </section>

      </div>
    </>
  );
}