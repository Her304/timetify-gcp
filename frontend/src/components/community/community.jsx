import { Mail01 } from "@untitledui/icons";
import { T, FF, MonoLabel, PillBtn, Blob } from "@/components/shared/brand";

const Community = () => {
  const sections = [
    {
      icon: "folder_shared",
      title: "share only what is yours",
      content: "you own everything you post on timetify — your schedule, your snaps, your messages. because of this, you should only post content you have the right to share. do not repost someone else's schedule or personal information without their permission, and do not copy content from elsewhere unless you have the right to do so. if someone asks you to remove something of theirs that you have shared, please do so. repeated violations of others' content rights will result in account restrictions.",
    },
    {
      icon: "emoji_language",
      title: "keep content appropriate for everyone",
      content: "timetify is used by students of all ages and backgrounds. do not post sexually explicit content, graphic violence, or anything that a reasonable person would find deeply offensive. we understand that context matters — content shared to raise awareness or for educational purposes is treated differently from content shared to shock or cause harm. when in doubt, ask yourself whether you would be comfortable with your teacher or parent seeing it.",
    },
    {
      icon: "thumbs_up_double",
      title: "foster real, meaningful connections",
      content: "do not artificially inflate your friend count, send mass connection requests, or flood chats with repetitive messages. do not offer anything in exchange for follows, acceptances, or engagement. timetify is built around genuine schedules and real relationships — gaming these systems undermines the very thing that makes the platform worthwhile. accounts found to be coordinating fake activity will be removed without warning.",
    },
    {
      icon: "person_alert",
      title: "be authentic — do not impersonate others",
      content: "you do not need to use your full legal name, but your account must represent a real person, and your information must be accurate. do not create accounts to impersonate a classmate, teacher, or institution. do not create secondary accounts to evade a ban or to harass someone after being blocked. if we find that an account exists specifically to deceive or mislead others, we will disable it.",
    },
    {
      icon: "passkey",
      title: "respect privacy — your own and others'",
      content: "do not share someone's personal information — telephone number, home address, class schedule, or private messages — without their explicit consent. what people share on timetify about their time and location is sensitive by nature. do not screenshot and redistribute private conversations. do not use availability data to track, pressure, or monitor anyone. if you receive a private snap or message, it remains private.",
    },
    {
      icon: "rule",
      title: "follow the law, always",
      content: "timetify is not a platform for organising anything unlawful. do not use chats or events to coordinate the buying or selling of controlled substances, weapons, or stolen goods. do not share content that facilitates fraud, identity theft, or academic dishonesty on a large scale. we have zero tolerance for any content that sexually exploits minors — this results in immediate, permanent removal and referral to the relevant authorities.",
    },
    {
      icon: "safety_divider",
      title: "no harassment or hate",
      content: "we remove content that threatens, demeans, or targets someone on the basis of who they are — their race, ethnicity, gender, sexuality, religion, disability, or background. we also remove content designed to humiliate a specific private individual, doxxing attempts, and sustained campaigns of unwanted contact. public figures and people in the news may be subject to stronger criticism, but even they remain protected from credible threats and targeted hate.",
    },
    {
      icon: "groups_3",
      title: "help us keep the community strong",
      content: "if you see something that does not belong — harassment, spam, fake accounts, illegal coordination — use the in-app report option or email us directly. we review every report. please include as much detail as you can: usernames, timestamps, and screenshots. reports remain confidential. many issues can also be resolved directly — if someone has posted your content without permission, try asking them to remove it first. if that does not work, we are here to help. your role in keeping this community safe matters just as much as ours.",
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
          timetify is built to be an authentic and safe place for students to connect, coordinate, and study together. help us keep it that way. by using timetify, you agree to these guidelines and our terms of service. overstepping these boundaries may result in content removal, account restrictions, or a permanent ban.
        </p>
        <p className="text-xs text-ink-40" style={{ fontFamily: FF.mono }}>last updated: {new Date().toLocaleDateString()}</p>
      </section>

      <section className="grid md:grid-cols-1 gap-4">
        {sections.map((section, index) => (
          <div key={index} className="bg-white p-7 rounded-3xl border border-ink-8 flex flex-col md:flex-row gap-5 items-start">
            <div className="flex-shrink-0 w-12 h-12 rounded-full grid place-items-center" style={{ background: T.coralLt, color: T.coralDk }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24 }}>{section.icon}</span>
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
            each of us plays an important part in this community. if you see content that violates these guidelines, please report it — we have a team that reviews every report and acts quickly. your report is always confidential.
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
