// All portfolio text lives here. Edit this file to change what the home screen says;
// home.js renders it, so no UI code needs touching for content changes.

export const profile = {
  name: "Pawan Sah",
  short: "PAWAN",
  role: "Full-Stack Developer",
  tagline: "Full-Stack Developer · Automation Nerd",
  location: "Faridabad, India",
  trainerId: "05728",
  intro: [
    "Hi! I'm PAWAN, a full-stack developer who ships real products.",
    "Right now I'm building ScanlyFix, a free website scanner that 500+ people already use.",
  ],
  about:
    "I build production web apps end to end: Next.js and React on the front, Node, Python and FastAPI on the back, Postgres and MongoDB underneath, and Docker, AWS and n8n automations around it all. Right now I'm building ScanlyFix, a platform that finds and fixes everything that is wrong with a website.",
  timezones: "Happy to work across USA, UK and India time zones",
};

export const contact = {
  email: "pawan572893@gmail.com",
  github: "https://github.com/Pawan-webdeveloper",
  githubHandle: "Pawan-webdeveloper",
  linkedin: "https://www.linkedin.com/in/pawan-sah-661a86327/",
  linkedinHandle: "pawan-sah",
  website: "https://pawansah-portfolio.vercel.app/",
  websiteLabel: "pawansah-portfolio.vercel.app",
};

// Pokémon-type colours used for the tech-stack chips
export const types = {
  frontend: { label: "FRONT", color: "#f08030" },
  backend: { label: "BACK", color: "#6890f0" },
  data: { label: "DATA", color: "#a890f0" },
  ai: { label: "AI", color: "#f85888" },
  devops: { label: "OPS", color: "#78c850" },
  edge: { label: "EDGE", color: "#b8a038" },
};

export const team = [
  {
    id: "scanlyfix",
    name: "ScanlyFix",
    pokemon: "greninja",
    pokemonName: "GRENINJA",
    nickname: "Best project",
    level: 72,
    color: "#2f7fd1",
    accent: "#6ed3ff",
    url: "https://scanlyfix.com/",
    urlLabel: "scanlyfix.com",
    repo: null,
    tagline: "Paste a URL. Find everything wrong with your website. Fix it.",
    description:
      "A free website scanner that runs 100+ read-only checks across security, SEO, AI-answer visibility (AEO), performance, accessibility and compliance. Every finding comes with severity, evidence, remediation and a copy-paste fix prompt, plus Auto-Fix pull requests for connected GitHub repos.",
    role: "Building it end to end: architecture, check engine, scanner workers, web app and the AI fix pipeline.",
    stack: [
      ["Next.js 16", "frontend"],
      ["TypeScript", "frontend"],
      ["Node.js", "backend"],
      ["Inngest", "backend"],
      ["Drizzle", "data"],
      ["Supabase", "data"],
      ["OpenRouter", "ai"],
      ["MCP", "ai"],
      ["Docker", "devops"],
      ["Turborepo", "devops"],
    ],
    moves: [
      { name: "100+ CHECKS", type: "backend", desc: "Nine categories: security, SEO, AEO, performance, a11y, compliance, domain, email and context." },
      { name: "FIX PROMPT", type: "ai", desc: "Every finding generates a ready-to-paste AI fix prompt from the evidence." },
      { name: "AUTO-FIX PR", type: "devops", desc: "GitHub App scans repos with gitleaks and osv-scanner and opens fix pull requests." },
      { name: "SCAN ANYWHERE", type: "frontend", desc: "Use it from the web dashboard, the CLI, the API or as an MCP tool server." },
    ],
    arch: [
      { label: "Web app", sub: "Next.js 16 dashboard + API routes" },
      { label: "Job queue", sub: "Inngest scans, reports, monitoring" },
      { label: "Check engine", sub: "packages/checks, SSRF-guarded" },
      { label: "Workers", sub: "Headless browser + GitHub repo scanner (Docker)" },
      { label: "Data + AI", sub: "Drizzle/Supabase Postgres · OpenRouter fixes" },
    ],
    stats: { users: "500+", checks: "100+", interfaces: "Web · CLI · API · MCP" },
  },
  {
    id: "bennet",
    name: "Bennet AI",
    pokemon: "charizard",
    pokemonName: "CHARIZARD",
    nickname: "AI support",
    level: 58,
    color: "#e2622f",
    accent: "#ffc04a",
    url: "https://bennet-ai.vercel.app/",
    urlLabel: "bennet-ai.vercel.app",
    repo: "https://github.com/Pawan-webdeveloper/Bennet-AI",
    tagline: "A no-code AI support agent trained on your own docs.",
    description:
      "Businesses sign in, give Bennet their docs and rules, and drop one line of script on their site. Visitors get an AI support chatbot that answers from the business's own content, while the admin dashboard controls exactly what it says.",
    role: "Built end to end: Next.js app, SSO auth, chat API, embed widget and the landing page.",
    stack: [
      ["Next.js 16", "frontend"],
      ["React 19", "frontend"],
      ["Tailwind 4", "frontend"],
      ["GSAP", "frontend"],
      ["Gemini API", "ai"],
      ["MongoDB", "data"],
      ["Scalekit SSO", "backend"],
      ["Vercel", "devops"],
    ],
    moves: [
      { name: "ONE-LINE EMBED", type: "frontend", desc: "A single script tag drops the chat widget onto any website." },
      { name: "DOC TRAINING", type: "ai", desc: "Answers come from the business's own docs and settings via Gemini." },
      { name: "ADMIN CONTROL", type: "backend", desc: "Dashboard to set tone, rules and what the bot is allowed to answer." },
      { name: "SECURE LOGIN", type: "backend", desc: "Scalekit SSO login, callback and session handling." },
    ],
    arch: [
      { label: "Embed script", sub: "chatBot.js on the client's site" },
      { label: "Widget", sub: "/embed chat UI (iframe)" },
      { label: "Chat API", sub: "/api/chat → Gemini with business context" },
      { label: "Dashboard", sub: "Scalekit auth · /api/settings" },
      { label: "Database", sub: "MongoDB (Mongoose) per-tenant settings" },
    ],
    stats: { setup: "1 line", model: "Gemini", auth: "SSO" },
  },
  {
    id: "thirdeye",
    name: "ThirdEye",
    pokemon: "gengar",
    pokemonName: "GENGAR",
    nickname: "Safety, reimagined",
    level: 64,
    color: "#7a4fc4",
    accent: "#e05acb",
    url: "https://third-eye-main.vercel.app/",
    urlLabel: "third-eye-main.vercel.app",
    repo: "https://github.com/Pawan-webdeveloper/ThirdEye-model",
    tagline: "Turns existing CCTV into a real-time AI safety guardian.",
    description:
      "CCTV records but doesn't react. ThirdEye watches existing RTSP cameras with edge AI, detects violence, harassment, screams and proximity violations, and alerts police and helplines with a GPS-tagged clip in under 3 seconds, while blurring faces for privacy.",
    role: "Designed the detection-to-alert system and built the product website.",
    stack: [
      ["YOLOv8", "ai"],
      ["OpenPose", "ai"],
      ["Wav2Vec 2.0", "ai"],
      ["FastAPI", "backend"],
      ["Kafka", "backend"],
      ["PostgreSQL", "data"],
      ["Redis", "data"],
      ["React", "frontend"],
      ["Jetson Nano", "edge"],
    ],
    moves: [
      { name: "THREAT SENSE", type: "ai", desc: "Violence and harassment detection fused from video, pose and audio signals." },
      { name: "SCREAM ALERT", type: "ai", desc: "Wav2Vec 2.0 picks up screams and abuse in the audio stream." },
      { name: "RAPID ALERT", type: "backend", desc: "Under 3 s end to end: Twilio SMS/call + FCM push to police and 1091." },
      { name: "PRIVACY BLUR", type: "edge", desc: "Automatic face blur and short-lived clips, privacy by design." },
    ],
    arch: [
      { label: "CCTV (RTSP)", sub: "Works with existing cameras" },
      { label: "Edge AI", sub: "Jetson · YOLOv8 · OpenPose · Wav2Vec" },
      { label: "Kafka stream", sub: "Events + 10 s clips" },
      { label: "FastAPI + fusion", sub: "Bayesian multi-signal decision" },
      { label: "Alerts", sub: "Twilio + FCM → police, victim, dashboard" },
    ],
    stats: { alert: "< 3 s", cameras: "existing", privacy: "face blur" },
  },
];

// smaller projects, shown as the "PC box"
export const pcBox = [
  { name: "Gift Ideas", desc: "A cozy website for gift recommendations", url: "https://giftideaforx.com/", repo: "https://github.com/Pawan-webdeveloper/findgiftideas" },
  { name: "Report OIML", desc: "Test generation software", url: "https://report-oiml.onrender.com/", repo: "https://github.com/Pawan-webdeveloper/Report-OIML" },
  { name: "AI Summarize", desc: "AI text summarizer", url: "https://ai-summarize-eta.vercel.app", repo: "https://github.com/Pawan-webdeveloper/AI_Summarize" },
  { name: "Bus Tracker", desc: "Bus tracking app, frontend + backend", url: "https://bus-tracker-frontend-six.vercel.app", repo: "https://github.com/Pawan-webdeveloper/Bus-tracker-frontend" },
];

export const journey = [
  {
    chapter: "CHAPTER 2",
    title: "Building ScanlyFix",
    org: "ScanlyFix",
    when: "Now",
    text: "Building a free platform that finds and fixes everything wrong with a website: a check engine, scanner workers, AI fix prompts and Auto-Fix PRs. More than 500 people use it today.",
  },
  {
    chapter: "CHAPTER 1",
    title: "Full-Stack Developer",
    org: "Gyan Vandana",
    when: "2025 – 2026",
    text: "About a year building and shipping websites and web apps end to end, working across USA, UK and India time zones.",
  },
];

export const badges = [
  { name: "500+ USERS", color: "#f2c230", icon: "★" },
  { name: "BUILDER", color: "#d6452f", icon: "◆" },
  { name: "SHIPPER", color: "#1f9a8a", icon: "▲" },
  { name: "AI BUILDER", color: "#f85888", icon: "✦" },
  { name: "AUTOMATOR", color: "#6890f0", icon: "⚙" },
  { name: "FULL STACK", color: "#78c850", icon: "■" },
];

// Skills map: each town is a skill group. Order = walking order along the route.
export const towns = [
  { id: "front", name: "Frontend Town", type: "frontend", x: 12, y: 70, skills: ["HTML5", "CSS3", "JavaScript", "TypeScript", "React", "Next.js", "Tailwind CSS", "GSAP", "Three.js"] },
  { id: "back", name: "Backend City", type: "backend", x: 33, y: 38, skills: ["Node.js", "Express", "Python", "Django", "FastAPI", "REST APIs", "Auth / SSO"] },
  { id: "data", name: "Database Cave", type: "data", x: 52, y: 72, skills: ["PostgreSQL", "MySQL", "MongoDB", "Redis", "Drizzle ORM", "Supabase"] },
  { id: "ai", name: "AI Tower", type: "ai", x: 68, y: 30, skills: ["Gemini API", "OpenRouter", "LLM prompting", "MCP servers", "YOLOv8", "Computer vision"] },
  { id: "ops", name: "DevOps Harbor", type: "devops", x: 88, y: 62, skills: ["Docker", "AWS", "GitHub Actions", "Terraform", "Git", "Vercel", "n8n automation"] },
];

export const footer =
  "Fan-made, non-commercial portfolio. Pokémon © Nintendo / Creatures Inc. / GAME FREAK inc. Not affiliated.";
