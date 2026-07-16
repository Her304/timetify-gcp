import { Star, Blob, T, FF, MonoLabel, PillBtn } from "@/components/shared/brand";

const About = () => {
  return (
    <div className="space-y-12 py-8 relative">
      <Star color={T.lime} size={32} style={{ position: 'absolute', top: 12, right: '15%', transform: 'rotate(-15deg)' }}/>
      <Star color={T.coral} size={24} style={{ position: 'absolute', top: 64, left: '10%', transform: 'rotate(20deg)' }}/>
      <Blob color={T.lilac} size={120} seed={2} style={{ position: 'absolute', top: 200, right: '6%', opacity: 0.5 }}/>

      <section className="text-center space-y-3 relative">
        <MonoLabel>about</MonoLabel>
        <h1 className="text-6xl text-ink leading-none" style={{ fontFamily: FF.serif, letterSpacing: -1.8 }}>
          about <span style={{ color: T.coral }}>timetify</span>
        </h1>
        <p className="text-base text-ink-60 max-w-2xl mx-auto leading-relaxed">
          the social scheduling platform that keeps you and your friends in sync, effortlessly.
        </p>
      </section>

      <section className="bg-white p-10 rounded-3xl border border-ink-8">
        <div className="space-y-5">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full" style={{ background: T.coralLt, color: T.coralDk }}>
            <span className="material-symbols-outlined" style={{ fontSize: 24 }}>ads_click</span>
          </div>
          <h2 className="text-3xl text-ink leading-none" style={{ fontFamily: FF.serif, letterSpacing: -1 }}>our mission</h2>
          <p className="text-base text-ink-60 leading-relaxed">
            staying connected should not be a chore. timetify bridges individual productivity and social connection — share schedules, discover mutual free time, and plan together.
          </p>
        </div>
      </section>

      <section className="space-y-6">
        <div className="text-center space-y-2">
          <MonoLabel>why timetify</MonoLabel>
          <h2 className="text-3xl text-ink leading-none" style={{ fontFamily: FF.serif, letterSpacing: -1 }}>built for the chaotic week</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          {[
            { icon: "auto_awesome_motion", title: "artificial intelligence extraction", description: "upload your syllabus and let our artificial intelligence handle the scheduling.", bg: T.coral, fg: '#fff' },
            { icon: "connect_without_contact", title: "real-time sync", description: "instantly see when your friends are free or busy.", bg: T.lime, fg: T.ink },
          ].map((feature, i) => (
            <div key={i} className="p-7 bg-white rounded-3xl border border-ink-8 hover:border-coral transition-colors space-y-3">
              <div className="w-12 h-12 rounded-full grid place-items-center" style={{ background: feature.bg, color: feature.fg }}>
                <span className="material-symbols-outlined" style={{ fontSize: 24 }}>{feature.icon}</span>
              </div>
              <h3 className="text-xl text-ink leading-tight" style={{ fontFamily: FF.serif, letterSpacing: -0.5 }}>{feature.title}</h3>
              <p className="text-sm text-ink-60 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative overflow-hidden rounded-3xl p-10 sm:p-12 text-center space-y-5" style={{ background: T.ink, color: T.cream }}>
        <Blob color={T.coral} size={200} seed={0} style={{ position: 'absolute', top: -60, right: -60, opacity: 0.7 }}/>
        <Blob color={T.lilac} size={140} seed={2} style={{ position: 'absolute', bottom: -50, left: -50, opacity: 0.5 }}/>
        <div className="relative z-10 space-y-4">
          <MonoLabel color="rgba(248,244,237,.65)">questions?</MonoLabel>
          <h2 className="text-4xl leading-none" style={{ fontFamily: FF.serif, letterSpacing: -1.2 }}>
            we are here to help.
          </h2>
          <p className="max-w-lg mx-auto text-sm" style={{ color: 'rgba(248,244,237,.85)' }}>
            our team is always available to help you get the most out of timetify.
          </p>
          <div className="flex justify-center gap-3 pt-2 flex-wrap">
            <a href="mailto:help@timetify.net">
              <PillBtn bg={T.coral} fg="#fff" size="lg">contact us</PillBtn>
            </a>
            <a href="https://github.com/Her304/timetify" target="_blank" rel="noopener noreferrer">
              <PillBtn bg="rgba(255,255,255,.1)" fg="#fff" size="lg" style={{ border: '1px solid rgba(255,255,255,.2)' }}>
                <svg width="16" height="16" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M56.7937 84.9688C44.4187 83.4688 35.7 74.5625 35.7 63.0313C35.7 58.3438 37.3875 53.2813 40.2 49.9063C38.9812 46.8125 39.1687 40.25 40.575 37.5313C44.325 37.0625 49.3875 39.0313 52.3875 41.75C55.95 40.625 59.7 40.0625 64.2937 40.0625C68.8875 40.0625 72.6375 40.625 76.0125 41.6563C78.9187 39.0313 84.075 37.0625 87.825 37.5313C89.1375 40.0625 89.325 46.625 88.1062 49.8125C91.1062 53.375 92.7 58.1563 92.7 63.0313C92.7 74.5625 83.9812 83.2813 71.4187 84.875C74.6062 86.9375 76.7625 91.4375 76.7625 96.5938L76.7625 106.344C76.7625 109.156 79.1062 110.75 81.9187 109.625C98.8875 103.156 112.2 86.1875 112.2 65.1875C112.2 38.6563 90.6375 17 64.1062 17C37.575 17 16.2 38.6562 16.2 65.1875C16.2 86 29.4187 103.25 47.2312 109.719C49.7625 110.656 52.2 108.969 52.2 106.438L52.2 98.9375C50.8875 99.5 49.2 99.875 47.7 99.875C41.5125 99.875 37.8562 96.5 35.2312 90.2188C34.2 87.6875 33.075 86.1875 30.9187 85.9063C29.7937 85.8125 29.4187 85.3438 29.4187 84.7813C29.4187 83.6563 31.2937 82.8125 33.1687 82.8125C35.8875 82.8125 38.2312 84.5 40.6687 87.9688C42.5437 90.6875 44.5125 91.9063 46.8562 91.9063C49.2 91.9063 50.7 91.0625 52.8562 88.9063C54.45 87.3125 55.6687 85.9063 56.7937 84.9688Z" fill="white"/>
                </svg> view on github
              </PillBtn>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
};

export default About;
