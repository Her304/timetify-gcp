import { Users01, CheckDone01, Zap, MessageChatCircle } from "@untitledui/icons";
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
          the social scheduling platform that keeps u and ur friends in sync, effortlessly.
        </p>
      </section>

      <section className="bg-white p-10 rounded-3xl border border-ink-8">
        <div className="space-y-5">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full" style={{ background: T.coralLt, color: T.coralDk }}>
            <Users01 className="w-6 h-6" />
          </div>
          <h2 className="text-3xl text-ink leading-none" style={{ fontFamily: FF.serif, letterSpacing: -1 }}>our mission</h2>
          <p className="text-base text-ink-60 leading-relaxed">
            staying connected shouldn&apos;t be a chore. timetify bridges individual productivity and social connection — share schedules, discover mutual free time, and plan together.
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
            { icon: Zap, title: "ai-powered extraction", description: "upload ur syllabus and let our ai handle the scheduling.", bg: T.coral, fg: '#fff' },
            { icon: CheckDone01, title: "real-time sync", description: "instantly see when ur friends are free or busy.", bg: T.lime, fg: T.ink },
          ].map((feature, i) => (
            <div key={i} className="p-7 bg-white rounded-3xl border border-ink-8 hover:border-coral transition-colors space-y-3">
              <div className="w-12 h-12 rounded-full grid place-items-center" style={{ background: feature.bg, color: feature.fg }}>
                <feature.icon className="w-6 h-6" />
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
            we&apos;re here to help.
          </h2>
          <p className="max-w-lg mx-auto text-sm" style={{ color: 'rgba(248,244,237,.85)' }}>
            our team is always around to help u get the most out of timetify.
          </p>
          <div className="flex justify-center gap-3 pt-2 flex-wrap">
            <a href="mailto:help@timetify.net">
              <PillBtn bg={T.coral} fg="#fff" size="lg">contact us</PillBtn>
            </a>
            <a href="https://github.com/Her304/timetify" target="_blank" rel="noopener noreferrer">
              <PillBtn bg="rgba(255,255,255,.1)" fg="#fff" size="lg" style={{ border: '1px solid rgba(255,255,255,.2)' }}>
                <MessageChatCircle className="w-4 h-4" /> view on github
              </PillBtn>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
};

export default About;
