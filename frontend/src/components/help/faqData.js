/**
 * Help-page FAQ content.
 *
 * Extracted from help.jsx so it can be imported by plain-Node tooling:
 * scripts/prerender.mjs builds the FAQPage structured data from this exact
 * array, and Node cannot import a .jsx module. Keeping one copy means the
 * schema can never drift from what the page actually renders.
 */

export const FAQ_SECTIONS = [
  {
    id: "start",
    label: "getting started",
    items: [
      {
        q: "how do i create an account?",
        a: "select “sign up” and complete the basic details — name, email address, username, and password. you will need to accept the terms in order to continue (marketing emails are optional). you may also add a profile photograph if you wish. once complete, you will be logged in automatically and taken directly to your schedule.",
      },
      {
        q: "what happens the first time i log in?",
        a: "new accounts receive a brief guided tour highlighting the schedule, feed, notifications, profile, and the “+” button. this tour appears only once, and completing it takes you directly to adding your first class.",
      },
    ],
  },
  {
    id: "schedule",
    label: "your schedule",
    items: [
      {
        q: "how do i add my classes?",
        a: "select the “+” button and choose “add class”. you may either upload your syllabus document — timetify's AI will read it for you, extracting the course name, meeting days and times, term weeks, examinations, and assignments — or select “type manually” to enter a class by hand. once the artificial intelligence has finished, you will reach a review step where every class and its recurring assignments can be checked and adjusted before anything is added to your schedule.",
        shot: { src: "https://storage.googleapis.com/timetify-prod-media/help/syllabus-upload.mp4", name: "syllabus-upload.mp4", video: true },
      },
      {
        q: "what if the artificial intelligence makes a mistake?",
        a: "before anything is saved, you will see a review screen on which every field can be edited. if a date is missing because the syllabus referred only to, for example, “week three”, enter your term start and end dates and select “refine with my dates”; the artificial intelligence will then resolve the missing dates. you are permitted three re-analyses per day.",
      },
      {
        q: "can i edit or drop a class later?",
        a: "open the class from your schedule and select “edit” to change its times, or to add or remove weeks, examinations, and assignments. should you need to remove the class entirely, “drop this class” at the foot of the editor deletes it, together with everything associated with it, permanently.",
      },
    ],
  },
  {
    id: "friends",
    label: "friends and availability",
    items: [
      {
        q: "how do i add friends?",
        a: "you may search for people from the feed page. mutual friends are matched first, followed by other timetify users.",
      },
      {
        q: "how can i see who is currently free?",
        a: "your friends' current status — free, in class, or busy — is shown on the feed. timetify never reveals the titles of your events to friends; it shows only whether you are free or not.",
      },
      {
        q: "how do i find a time that works for a group?",
        a: "use “find a time” to compare free periods across your friends and send a study invitation for a time that suits everyone.",
      },
    ],
  },
  {
    id: "events",
    label: "events",
    items: [
      {
        q: "how do i create an event?",
        a: "select the “+” button and choose “add event”. set a name, date, time, and location, then choose who is invited and how visible the event should be.",
      },
      {
        q: "can i create an event straight from a chat?",
        a: "yes. type “/” in any chat to open the command menu and select “event”. the first step asks for a name and date; the second shows the times when everyone in the chat is free — tap a suggested slot to fill in the start and end times, adjust them if you wish, and add a location. once you confirm, an event card is posted directly into the chat, allowing everyone in the room to accept or decline.",
        shot: { src: "https://storage.googleapis.com/timetify-prod-media/help/event-from-chat.mp4", name: "event-from-chat.mp4", video: true },
      },
      {
        q: "how does confirming attendance work?",
        a: "invitees receive a notification and may accept or decline directly from the event card, either within the chat or on the event itself. accepting an invitation adds you to the event's group chat automatically.",
      },
      {
        q: "what happens if an event clashes with my schedule?",
        a: "timetify identifies the overlap before saving and shows you precisely what conflicts. you may then choose to skip that particular occurrence or keep both events — nothing is ever double-booked without your knowledge.",
      },
    ],
  },
  {
    id: "chat",
    label: "chat and snaps",
    items: [
      {
        q: "what are snaps?",
        a: "snaps are brief photographs that you may send to a friend. they disappear after a set period, and are intended for the moment rather than as a permanent post.",
      },
      {
        q: "how does group chat work?",
        a: "direct messages and group chats both appear in your chat list, ordered first by unread messages, then by who is currently free, and finally by most recent activity. creating an event from within a chat keeps every response and update in that same conversation.",
      },
    ],
  },
  {
    id: "account",
    label: "account and privacy",
    items: [
      {
        q: "who can see my schedule?",
        a: "only you, unless you choose to share it. you may set the visibility of each event individually — private (invitees only), friends only, or public — and friends can see only whether you are free or busy, never the details of an event, unless you have shared them directly.",
      },
      {
        q: "what should i do if i have forgotten my password?",
        a: "select “forgot password?” on the login screen, enter your email address, and follow the reset link that we send you.",
      },
    ],
  },
  {
    id: "agents",
    label: "ai agents",
    items: [
      {
        q: "can i connect an ai agent to my schedule?",
        a: "yes, though it is an advanced feature and entirely optional — nothing is connected until you choose to connect it. open your profile, select “settings”, and expand “connect an ai agent”. you may either generate an access token and paste it into your agent's configuration, or, for clients that are able to sign in themselves, give them the address https://timetify.net/mcp/v1/ and approve the request on the consent screen that follows.",
      },
      {
        q: "what can a connected agent see and do?",
        a: "only what you permit, and only within your own account. you may grant access to your class schedule, your free and busy times, the times you share with friends, and your unread message count, together with the ability to create classes and events on your own calendar. an agent can never reach another person's information, the contents of your snaps or chat messages, or the ability to post or send messages on your behalf. anything an agent wishes to create must first be returned to you as a preview and confirmed before it is saved.",
      },
      {
        q: "how do i disconnect an agent?",
        a: "return to “connect an ai agent” in your settings. tokens may be revoked individually, and applications you have signed in to may be disconnected; both take effect immediately. you may also narrow what an existing token is permitted to reach without replacing it. should a token ever be exposed — pasted into a conversation, for example, or committed to a repository — revoke it and generate a fresh one.",
      },
      {
        q: "why will my agent not connect?",
        a: "an agent running in the cloud cannot reach an address beginning “127.0.0.1” or “localhost”, as those refer to the machine the agent itself is running on rather than to yours; use https://timetify.net/mcp/v1/ instead. please note also that most clients require such a connection to be added from their own settings, as a custom connector, and cannot be instructed to add one during a conversation.",
      },
    ],
  },
];
