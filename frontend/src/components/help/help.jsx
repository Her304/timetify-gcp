import { Mail01, MessageChatCircle } from "@untitledui/icons";
import { Star, Blob, T, FF, MonoLabel } from "@/components/shared/brand";

const Help = () => {
  return (
    <div className="space-y-12 py-8 relative">
      <Star color={T.lime} size={28} style={{ position: 'absolute', top: 0, right: '15%', transform: 'rotate(-15deg)' }}/>
      <Blob color={T.lilac} size={100} seed={1} style={{ position: 'absolute', top: 40, left: '5%', opacity: 0.5 }}/>

      <section className="text-center space-y-3 relative">
        <MonoLabel>help</MonoLabel>
        <h1 className="text-6xl text-ink leading-none" style={{ fontFamily: FF.serif, letterSpacing: -1.8 }}>
          how can we <span style={{ color: T.coral }}>help</span>?
        </h1>
        <p className="text-base text-ink-60 max-w-2xl mx-auto leading-relaxed">
          need assistance with timetify? we&apos;re here to support u. drop a line and the team will help u out.
        </p>
      </section>

      <section className="bg-white p-10 rounded-3xl border border-ink-8">
        <div className="space-y-5">
          <MonoLabel>get in touch</MonoLabel>
          <h2 className="text-3xl text-ink leading-none" style={{ fontFamily: FF.serif, letterSpacing: -1 }}>
            questions, bugs, ideas
          </h2>
          <p className="text-base text-ink-60 leading-relaxed">
            whether u have a question, a feature request, or need to report a bug — we&apos;re ready to help u out.
          </p>

          <div className="space-y-3 pt-2">
            <a
              href="mailto:help@timetify.net"
              className="flex items-center gap-4 p-4 bg-cream rounded-2xl border border-ink-8 hover:border-coral transition-colors group"
            >
              <div className="w-12 h-12 rounded-full grid place-items-center" style={{ background: T.coral, color: '#fff' }}>
                <Mail01 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <MonoLabel>email</MonoLabel>
                <p className="text-base text-ink font-medium mt-0.5 group-hover:text-coral-dark transition-colors">
                  help@timetify.net
                </p>
              </div>
            </a>

            <a
              href="https://github.com/Her304/timetify"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-4 p-4 bg-cream rounded-2xl border border-ink-8 hover:border-coral transition-colors group"
            >
              <div className="w-12 h-12 rounded-full grid place-items-center" style={{ background: T.ink, color: T.cream }}>
                <MessageChatCircle className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <MonoLabel>github</MonoLabel>
                <p className="text-base text-ink font-medium mt-0.5 group-hover:text-coral-dark transition-colors">
                  check our repository
                </p>
              </div>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Help;
