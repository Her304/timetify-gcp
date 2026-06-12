import { Heart, Users01, AlertCircle, ShieldTick, SlashCircle01, Lock01, Eye, File02, Mail01 } from "@untitledui/icons";
import { T, FF, MonoLabel, PillBtn, Blob } from "@/components/shared/brand";

const Community = () => {
  const sections = [
    {
      icon: File02,
      title: "share only what's yours",
      content: "u own everything u post on timetify — ur schedule, ur snaps, ur messages. because of that, only post content u have the right to share. don't repost someone else's schedule or personal info without permission, and don't copy content from elsewhere that u don't have the rights to. if someone asks u to remove something of theirs that u've shared, please do it. repeated violations of others' content rights will result in account restrictions.",
    },
    {
      icon: Eye,
      title: "keep content appropriate for everyone",
      content: "timetify is used by students of all ages and backgrounds. don't post sexually explicit content, graphic violence, or anything that a reasonable person would find deeply offensive. we understand context matters — content shared to raise awareness or for educational purposes is treated differently than content shared to shock or harm. when in doubt, ask urself whether u'd be comfortable with ur professor or parent seeing it.",
    },
    {
      icon: Heart,
      title: "foster real, meaningful connections",
      content: "don't artificially inflate ur friend count, send mass connection requests, or flood chats with repetitive messages. don't offer anything in exchange for follows, accepts, or engagement. timetify is built around genuine schedules and real relationships — gaming those systems undermines the thing that makes the platform worth using. accounts found coordinating fake activity will be removed without warning.",
    },
    {
      icon: Users01,
      title: "be authentic — don't impersonate",
      content: "u don't have to use ur full legal name, but ur account must represent a real person and ur information must be accurate. don't create accounts to impersonate a classmate, professor, or institution. don't make secondary accounts to evade a ban or harass someone after being blocked. if we find an account exists specifically to deceive or mislead others, we'll disable it.",
    },
    {
      icon: Lock01,
      title: "respect privacy — ur own and others'",
      content: "don't share someone's personal information — phone number, home address, class schedule, or private messages — without their explicit consent. what people share on timetify about their time and location is sensitive by nature. don't screenshot and redistribute private conversations. don't use availability data to track, pressure, or monitor someone. if u receive a private snap or message, it stays private.",
    },
    {
      icon: SlashCircle01,
      title: "follow the law, always",
      content: "timetify is not a place to organize anything illegal. don't use chats or events to coordinate the buying or selling of controlled substances, weapons, or stolen goods. don't share content that facilitates fraud, identity theft, or academic dishonesty at scale. we have zero tolerance for any content that sexually exploits minors — this results in immediate permanent removal and reporting to relevant authorities.",
    },
    {
      icon: ShieldTick,
      title: "no harassment or hate",
      content: "we remove content that threatens, demeans, or targets someone based on who they are — their race, ethnicity, gender, sexuality, religion, disability, or background. we also remove content designed to humiliate a specific private individual, doxxing attempts, and sustained campaigns of unwanted contact. public figures and people in the news may be subject to stronger criticism, but even they are protected from credible threats and targeted hate.",
    },
    {
      icon: AlertCircle,
      title: "help us keep the community strong",
      content: "if u see something that doesn't belong — harassment, spam, fake accounts, illegal coordination — use the in-app report option or email us directly. we review every report. include as much detail as u can: usernames, timestamps, screenshots. reports are confidential. many issues can also be resolved directly — if someone posted ur content without permission, try asking them first. if that doesn't work, we're here. ur role in keeping this community safe matters as much as ours.",
    },
  ];

  return (
    <div className="space-y-10 py-8">
      <section className="text-center space-y-3">
        <MonoLabel>guidelines</MonoLabel>
        <h1 className="text-6xl text-ink leading-none" style={{ fontFamily: FF.serif, letterSpacing: -1.8 }}>
          community <span style={{ color: T.coral }}>guidelines</span>
        </h1>
        <p className="text-base text-ink-60 max-w-2xl mx-auto leading-relaxed">
          timetify is built to be an authentic and safe place for students to connect, coordinate, and study together. help us keep it that way. by using timetify, u agree to these guidelines and our terms of service. overstepping these boundaries may result in content removal, account restrictions, or permanent bans.
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
          <MonoLabel color="rgba(248,244,237,.65)">see something wrong?</MonoLabel>
          <h2 className="text-3xl leading-none" style={{ fontFamily: FF.serif, letterSpacing: -1 }}>help us keep timetify safe</h2>
          <p className="max-w-lg mx-auto text-sm" style={{ color: 'rgba(248,244,237,.85)' }}>
            each of us is an important part of this community. if u see content that violates these guidelines, report it — we have a team that reviews every report and works quickly. ur report is always confidential.
          </p>
          <div className="flex justify-center pt-2">
            <a href="mailto:help@timetify.net">
              <PillBtn bg={T.coral} fg="#fff" size="lg">
                <Mail01 className="w-4 h-4" /> contact us
              </PillBtn>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Community;
