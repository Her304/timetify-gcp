import { ShieldTick, Lock01, Eye, Settings01, Edit02, Mail01 } from "@untitledui/icons";
import { T, FF, MonoLabel, PillBtn, Blob } from "@/components/shared/brand";

const Privacy = () => {
  const sections = [
    { icon: Eye, title: "what we collect", content: "we collect info u give us directly when u create an account — name, email, schedule data u upload or enter." },
    { icon: ShieldTick, title: "how we use it", content: "we use ur info to provide, maintain, and improve our services — sync schedules w friends u've authorized, send technical notices and support messages." },
    { icon: Lock01, title: "data security", content: "we take reasonable measures to protect info from loss, theft, misuse and unauthorized access, disclosure, alteration, and destruction." },
    { icon: Settings01, title: "ur choices", content: "u can update, correct, or delete ur account info anytime via settings or by emailing us. u can also control visibility of ur schedule through profile settings." },
    { icon: Edit02, title: "changes to this policy", content: "we may change this policy from time to time. if we make changes, we'll notify u by revising the date at the top — sometimes w additional notice." },
  ];

  return (
    <div className="space-y-10 py-8">
      <section className="text-center space-y-3">
        <MonoLabel>policy</MonoLabel>
        <h1 className="text-6xl text-ink leading-none" style={{ fontFamily: FF.serif, letterSpacing: -1.8 }}>
          privacy <span style={{ color: T.coral }}>policy</span>
        </h1>
        <p className="text-base text-ink-60 max-w-2xl mx-auto leading-relaxed">
          ur privacy matters. here&apos;s how we collect, use, and protect ur info.
        </p>
        <p className="text-xs text-ink-40" style={{ fontFamily: FF.mono }}>last updated: {new Date().toLocaleDateString()}</p>
      </section>

      <section className="grid md:grid-cols-1 gap-4">
        {sections.map((section, index) => (
          <div key={index} className="bg-white p-7 rounded-3xl border border-ink-8 flex flex-col md:flex-row gap-5 items-start">
            <div className="flex-shrink-0 w-12 h-12 rounded-full grid place-items-center" style={{ background: T.coralLt, color: T.coralDk }}>
              <section.icon className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl text-ink leading-none" style={{ fontFamily: FF.serif, letterSpacing: -0.7 }}>{section.title}</h2>
              <p className="text-base text-ink-60 leading-relaxed">{section.content}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="relative overflow-hidden rounded-3xl p-10 text-center space-y-4" style={{ background: T.ink, color: T.cream }}>
        <Blob color={T.coral} size={140} seed={0} style={{ position: 'absolute', top: -40, right: -40, opacity: 0.7 }}/>
        <div className="relative z-10 space-y-4">
          <MonoLabel color="rgba(248,244,237,.65)">questions?</MonoLabel>
          <h2 className="text-3xl leading-none" style={{ fontFamily: FF.serif, letterSpacing: -1 }}>still have questions?</h2>
          <p className="max-w-lg mx-auto text-sm" style={{ color: 'rgba(248,244,237,.85)' }}>
            email our privacy team if u have any concerns about how ur data is handled.
          </p>
          <div className="flex justify-center pt-2">
            <a href="mailto:help@timetify.net">
              <PillBtn bg={T.coral} fg="#fff" size="lg">
                <Mail01 className="w-4 h-4" /> email us
              </PillBtn>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Privacy;
