import { useState } from "react";
import { Mail01 } from "@untitledui/icons";
import { Star, Blob, T, FF, MonoLabel, Icon } from "@/components/shared/brand";

import { FAQ_SECTIONS } from "./faqData";

function StepShot({ src, name, video }) {
  const [errored, setErrored] = useState(false);
  return (
    <div className="mt-4 rounded-2xl overflow-hidden border border-ink-8 bg-cream max-w-2xl">
      {errored ? (
        <div className="aspect-video flex flex-col items-center justify-center gap-2 p-6 text-center">
          <Icon name="cam" size={20} color={T.ink40} />
          <p className="text-[11px] leading-relaxed" style={{ color: T.ink40, fontFamily: FF.mono }}>
            {video ? `couldn't load ${name}` : `drop ${name} in frontend/public/help/`}
          </p>
        </div>
      ) : video ? (
        <video src={src} controls playsInline className="w-full block" onError={() => setErrored(true)} />
      ) : (
        <img src={src} alt="" onError={() => setErrored(true)} className="w-full block" />
      )}
    </div>
  );
}

function FaqItem({ q, a, shot }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-ink-8 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-4 py-5 text-left"
        aria-expanded={open}
      >
        <span className="text-base sm:text-lg text-ink font-medium leading-snug" style={{ fontFamily: FF.sans }}>
          {q}
        </span>
        <span
          className="w-7 h-7 rounded-full grid place-items-center flex-shrink-0 transition-transform duration-200"
          style={{ background: T.cream, transform: open ? "rotate(180deg)" : "none" }}
        >
          <Icon name="chevD" size={14} color={T.ink} />
        </span>
      </button>
      {open && (
        <div className="pb-6 -mt-1">
          <p className="text-sm text-ink-60 leading-relaxed max-w-2xl">{a}</p>
          {shot && <StepShot src={shot.src} name={shot.name} video={shot.video} />}
        </div>
      )}
    </div>
  );
}

function FaqSection({ id, label, items }) {
  return (
    <section id={id} className="bg-white p-8 sm:p-10 rounded-3xl border border-ink-8 scroll-mt-24">
      <MonoLabel>{label}</MonoLabel>
      <div className="mt-1">
        {items.map((item) => (
          <FaqItem key={item.q} {...item} />
        ))}
      </div>
    </section>
  );
}

const Help = () => {
  return (
    <div className="space-y-8 py-8 relative">
      <Star color={T.lime} size={28} style={{ position: "absolute", top: 0, right: "15%", transform: "rotate(-15deg)" }} />
      <Blob color={T.lilac} size={100} seed={1} style={{ position: "absolute", top: 40, left: "5%", opacity: 0.5 }} />

      <section className="text-center space-y-3 relative">
        <MonoLabel>help centre</MonoLabel>
        <h1 className="text-6xl text-ink leading-none" style={{ fontFamily: FF.serif, letterSpacing: -1.8 }}>
          how can we <span style={{ color: T.coral }}>help</span>?
        </h1>
        <p className="text-base text-ink-60 max-w-2xl mx-auto leading-relaxed">
          everything you need in order to set up your classes, friends, and events on timetify. if you cannot find what you are looking for here, please scroll down to reach our team.
        </p>
      </section>

      <nav className="flex flex-wrap justify-center gap-2 relative" aria-label="faq categories">
        {FAQ_SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="px-4 py-2 rounded-full text-xs lowercase font-medium bg-white border border-ink-8 hover:border-coral transition-colors"
            style={{ fontFamily: FF.sans, color: T.ink }}
          >
            {s.label}
          </a>
        ))}
      </nav>

      <div className="space-y-5">
        {FAQ_SECTIONS.map((section) => (
          <FaqSection key={section.id} {...section} />
        ))}
      </div>

      <section className="bg-white p-10 rounded-3xl border border-ink-8">
        <div className="space-y-5">
          <MonoLabel>still stuck?</MonoLabel>
          <h2 className="text-3xl text-ink leading-none" style={{ fontFamily: FF.serif, letterSpacing: -1 }}>
            questions, bugs, ideas
          </h2>
          <p className="text-base text-ink-60 leading-relaxed">
            whether you have a question, a feature request, or need to report a bug, we are ready to assist you.
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
              <div className="w-12 h-12 rounded-full grid place-items-center" style={{ background: T.ink }}>
                <svg width="22" height="22" viewBox="0 0 128 128" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M56.7937 84.9688C44.4187 83.4688 35.7 74.5625 35.7 63.0313C35.7 58.3438 37.3875 53.2813 40.2 49.9063C38.9812 46.8125 39.1687 40.25 40.575 37.5313C44.325 37.0625 49.3875 39.0313 52.3875 41.75C55.95 40.625 59.7 40.0625 64.2937 40.0625C68.8875 40.0625 72.6375 40.625 76.0125 41.6563C78.9187 39.0313 84.075 37.0625 87.825 37.5313C89.1375 40.0625 89.325 46.625 88.1062 49.8125C91.1062 53.375 92.7 58.1563 92.7 63.0313C92.7 74.5625 83.9812 83.2813 71.4187 84.875C74.6062 86.9375 76.7625 91.4375 76.7625 96.5938L76.7625 106.344C76.7625 109.156 79.1062 110.75 81.9187 109.625C98.8875 103.156 112.2 86.1875 112.2 65.1875C112.2 38.6563 90.6375 17 64.1062 17C37.575 17 16.2 38.6562 16.2 65.1875C16.2 86 29.4187 103.25 47.2312 109.719C49.7625 110.656 52.2 108.969 52.2 106.438L52.2 98.9375C50.8875 99.5 49.2 99.875 47.7 99.875C41.5125 99.875 37.8562 96.5 35.2312 90.2188C34.2 87.6875 33.075 86.1875 30.9187 85.9063C29.7937 85.8125 29.4187 85.3438 29.4187 84.7813C29.4187 83.6563 31.2937 82.8125 33.1687 82.8125C35.8875 82.8125 38.2312 84.5 40.6687 87.9688C42.5437 90.6875 44.5125 91.9063 46.8562 91.9063C49.2 91.9063 50.7 91.0625 52.8562 88.9063C54.45 87.3125 55.6687 85.9063 56.7937 84.9688Z" fill="white"/>
                </svg>
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
