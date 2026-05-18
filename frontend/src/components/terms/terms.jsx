import { File02, User01, AlertCircle, Settings01, Mail01 } from "@untitledui/icons";
import { T, FF, MonoLabel, PillBtn, Blob } from "@/components/shared/brand";

const Terms = () => {
  const sections = [
    { icon: User01, title: "account terms", content: "u are responsible for maintaining the security of ur account and password. each account is for individual use only and should not be shared." },
    { icon: File02, title: "content & conduct", content: "u retain all rights to the schedule data u upload. by using our services, u grant us a license to host and sync this content per ur privacy settings. don't use timetify for any illegal or unauthorized purpose." },
    { icon: AlertCircle, title: "limitation of liability", content: "timetify is provided 'as is' without warranties of any kind. we're not liable for any damages from ur use of the service or interruptions in availability." },
    { icon: Settings01, title: "modifications to terms", content: "we reserve the right to modify these terms at any time. significant changes will be communicated via email or a prominent notice on the platform." },
  ];

  return (
    <div className="space-y-10 py-8">
      <section className="text-center space-y-3">
        <MonoLabel>legal</MonoLabel>
        <h1 className="text-6xl text-ink leading-none" style={{ fontFamily: FF.serif, letterSpacing: -1.8 }}>
          terms of <span style={{ color: T.coral }}>service</span>
        </h1>
        <p className="text-base text-ink-60 max-w-2xl mx-auto leading-relaxed">
          pls read these terms carefully before using our platform. ur access is conditioned on ur acceptance of these terms.
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
          <h2 className="text-3xl leading-none" style={{ fontFamily: FF.serif, letterSpacing: -1 }}>questions about our terms?</h2>
          <p className="max-w-lg mx-auto text-sm" style={{ color: 'rgba(248,244,237,.85)' }}>
            email us — we&apos;ll get back to u.
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

export default Terms;
