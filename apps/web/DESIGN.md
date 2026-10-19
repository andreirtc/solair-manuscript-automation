---
name: "SolAir"
description: "Solar warmth and cobalt airflow for deliberate manuscript revision."
colors:
  ground: "#fffdf8"
  surface: "#fff"
  subtle: "#f3f4f2"
  soft: "#eaf0fb"
  ink: "#202b3a"
  muted: "#626d79"
  line: "#dce0e4"
  brand: "#1959b5"
  brand-strong: "#12458f"
  sun: "#e69a18"
  sun-soft: "#fff2d8"
  error: "#a02f32"
  error-bg: "#fff0ee"
  success: "#267153"
  solar-ink: "#945305"
  action: "#efb142"
  on-action: "#30220c"
  dark-ground: "#12161d"
  dark-surface: "#171e28"
  dark-subtle: "#1e2733"
  dark-soft: "#202f49"
  dark-ink: "#eef1f6"
  dark-muted: "#aab5c6"
  dark-line: "#344050"
  dark-brand: "#88b7ff"
  dark-brand-strong: "#a8cbff"
  dark-sun: "#ffbd4f"
  dark-sun-soft: "#3b3020"
  dark-error: "#ffb1ae"
  dark-error-bg: "#3a2228"
  dark-success: "#88d4b1"
  dark-solar-ink: "#ffc66c"
  dark-action: "#ffc466"
  dark-on-action: "#30220c"
  action-hover: "color-mix(in srgb, var(--action) 84%, white)"
  role-manuscript: "#945305"
  role-manuscript-soft: "#fff0cf"
  role-defense: "#7250a6"
  role-defense-soft: "#efe6fb"
  role-questions: "#a83d75"
  role-questions-soft: "#fbe5f1"
  role-prototype: "#1959b5"
  role-prototype-soft: "#eaf0fb"
  dark-role-manuscript: "#ffc66c"
  dark-role-manuscript-soft: "#3b3020"
  dark-role-defense: "#ceb2f2"
  dark-role-defense-soft: "#30253f"
  dark-role-questions: "#ffadda"
  dark-role-questions-soft: "#3d2233"
  dark-role-prototype: "#88b7ff"
  dark-role-prototype-soft: "#202f49"
  dark-example-paper: "#f7f3eb"
  example-paper-ink: "#273142"
  example-before: "#8d4241"
  example-after: "#245843"
typography:
  display:
    fontFamily: "\"Outfit\", sans-serif"
    fontSize: "clamp(3.2rem, 6vw, 5.8rem)"
    fontWeight: 600
    lineHeight: 1.04
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "\"Outfit\", sans-serif"
    fontSize: "2.35rem"
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: "-0.025em"
  title:
    fontFamily: "\"Outfit\", sans-serif"
    fontSize: "1.55rem"
    fontWeight: 500
    lineHeight: 1.25
    letterSpacing: "-0.025em"
  body:
    fontFamily: "\"Work Sans\", sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.65
  label:
    fontFamily: "\"Work Sans\", sans-serif"
    fontSize: "0.88rem"
    fontWeight: 500
  comparison:
    fontFamily: "\"Work Sans\", sans-serif"
    fontSize: "0.85rem"
    fontWeight: 400
    lineHeight: 1.8
rounded:
  badge: "5px"
  scope: "7px"
  field: "8px"
  navigation: "9px"
  button: "10px"
  popover: "12px"
  illustration: "14px"
  panel: "16px"
  round: "50%"
spacing:
  xs: "8px"
  sm: "12px"
  md: "18px"
  lg: "24px"
  xl: "36px"
  2xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.action}"
    textColor: "{colors.on-action}"
    rounded: "{rounded.button}"
    padding: "10px 18px"
  button-primary-hover:
    backgroundColor: "{colors.action-hover}"
    textColor: "{colors.on-action}"
  button-subtle:
    backgroundColor: "{colors.subtle}"
    textColor: "{colors.ink}"
    rounded: "{rounded.button}"
    padding: "10px 18px"
  button-danger:
    backgroundColor: "{colors.error-bg}"
    textColor: "{colors.error}"
    rounded: "{rounded.button}"
    padding: "10px 18px"
  input:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "12px 13px"
  nav-item:
    textColor: "{colors.ink}"
    rounded: "{rounded.navigation}"
    padding: "12px 14px"
  nav-item-active:
    backgroundColor: "{colors.sun-soft}"
    textColor: "{colors.solar-ink}"
  badge:
    backgroundColor: "{colors.subtle}"
    textColor: "{colors.muted}"
    rounded: "{rounded.badge}"
    padding: "4px 8px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
    padding: "36px"
  composer:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.panel}"
    padding: "18px 18px 12px"
  comparison-before:
    backgroundColor: "{colors.subtle}"
    rounded: "{rounded.button}"
    padding: "17px"
  comparison-proposed:
    backgroundColor: "{colors.soft}"
    rounded: "{rounded.button}"
    padding: "17px"
  agent-options:
    backgroundColor: "{colors.subtle}"
    rounded: "{rounded.popover}"
    padding: "18px"
  role-choice:
    textColor: "{colors.muted}"
    rounded: "{rounded.button}"
    padding: "10px 16px"
  role-choice-selected:
    backgroundColor: "{colors.role-manuscript-soft}"
    textColor: "{colors.role-manuscript}"
  illustrative-paper:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
  scope-picker:
    backgroundColor: "{colors.subtle}"
    rounded: "{rounded.scope}"
    padding: "8px 10px"
---

# Design System: SolAir

## Overview

**Creative North Star: "Solar energy. Fresh perspective."**

SolAir pairs the warmth of solar gold with the clarity of cobalt airflow. Spacious pale-paper or navy grounds, precise mixed-case identity, the original robot host and four distinct floating role creatures welcome the team; the working interface settles into a quiet document workbench with readable changes and restrained chrome.

This is the implemented visual world, extracted from the final `style.css` → `refresh.css` cascade and React components. The expanded welcome scene uses semantic manuscript paper beside the original robot; yellow bird, purple cat, pink axolotl and blue snail companions support the four conversation purposes. The second wordmark uses precise font-outline lettering with a solar/wind emblem, replacing the rejected hand-drawn treatment. Google One, GitHub and Atlas OS are user-supplied references for space, welcome and visible motion; SolAir does not imply affiliation or reuse their characters.

**Key Characteristics:**
- Solar gold for action and warmth; cobalt for links, focus and airflow.
- Outfit headings with Work Sans reading and controls.
- Tonal document panels, fine dividers and selective ambient depth.
- Persistent light/dark choice, controllable illustrative motion and a quiet workspace.

This record describes the built visual system, not conformance certification. Source: `src/style.css`, `src/refresh.css`, `src/welcome.tsx`, `src/companions.tsx`, `src/main.tsx`, `src/workspace.tsx` and the existing workbench components. Captures and receipts live in `../../.local/acceptance/visual-refresh/`: arrival/landing at 1440, 1366, 1920 and 390px, plus roles/sign-in/home at 1440 and 390px, in light/dark. The recorded 13 UI checks and two motion checks passed; protected/auth flows use synthetic fixtures and do not establish real teammate consent, personal model entitlement, cloud deployment or successful manuscript writes. No contrast certification is asserted. A separate QUALITY BAR card was not supplied and is not reconstructed here.

## Colors

The palette gives solar warmth to decisions, cobalt clarity to navigation and warm or cool neutrals to reading. Frontmatter contains the actual values; unprefixed tokens are light theme and `dark-` tokens are the dark overrides.

### Primary

- **Solar action** (`action`, `on-action`): primary actions and send button, with a warm pale hover mix.
- **Solar emphasis** (`solar-ink`, `sun`, `sun-soft`): the second hero line, active sidebar navigation, emblem, review prompts and welcoming accents.

### Secondary

- **Airflow cobalt** (`brand`, `brand-strong`, `soft`): links, keyboard focus, emblem, proposal links, selected proposals and the proposed half of a real comparison. `brand-strong` remains a declared legacy token; final primary hover uses `action-hover`.

### Tertiary

- **Manuscript amber, Defense violet, Questions pink and Prototype blue** (`role-*` pairs): selected purpose buttons, role headings and restrained scene halos. Artwork is yellow/purple/pink/blue; readable text accents are deeper hues in light mode and pale hues in dark mode. These accents identify a purpose; they do not indicate approval or verification.
- **Illustrative paper** (`example-*`): the public example remains warm pale paper with dark ink in dark mode. Its labelled before/proposed red/green treatment belongs to the illustration; real review retains subtle/soft comparison panels and explicit removals.

### Neutral

- **Warm ground / paper** (`ground`, `surface`, `subtle`): page canvas, cards and quiet current-text panels.
- **Manuscript ink / supporting ink / rule** (`ink`, `muted`, `line`): hierarchy and dividers. Dark mode shifts to navy/slate grounds and pale readable ink.

Feedback uses `error` and `error-bg` for failure/removal, `success` for connected/completed status, with text labels carrying the meaning.

**The Solar Action Rule.** Primary buttons and send controls use the action/on-action pair; cobalt remains the link, focus and airflow color.

`src/refresh.css` loads after `src/style.css` and owns the illustrated welcome, role accents, sign-in character and chat empty-state overrides. The last root blocks in `src/style.css` override the earlier ground values and add solar-ink/action/on-action. Later primary/send rules override the earlier blue light/dark button colors. Later hero-span and active-sidebar rules replace cobalt emphasis with solar emphasis. Do not extract an earlier declaration as the effective design token. Mobile bottom navigation still uses cobalt for its active state.

## Typography

**Display Font:** Outfit, sans-serif fallback. **Body Font:** Work Sans, sans-serif fallback. Both are self-hosted WOFF2 with `font-display: swap`; the font CSS declares weights 400–800. Actual routine UI uses 400 and 500.

Outfit gives headings a round, precise confidence; Work Sans keeps dense review text and controls readable. The outlined SolAir wordmark is SVG geometry and does not require live text rendering.

- **Display:** the centered welcome promise uses the frontmatter display role. Short desktops (height ≤850px, width ≥701px) use (clamp(3rem, 5.4vw, 4.8rem)); phones use (clamp(2.35rem, 8.7vw, 3.4rem), 1.08 line height, -0.03em tracking).
- **Headline:** workspace page titles use the headline role; phone titles reduce to (2rem) with (1.15) line height. The role home heading uses (clamp(1.9rem, 3vw, 2.7rem)), then (1.75rem) on phones. Role showcase headings scale through (clamp(2rem, 3vw, 3.2rem)).
- **Title:** default second-level headings use the title role; the third level is (1.18rem).
- **Body:** the root size is (15px); messages use (0.94rem, 1.85 line height) within (75ch). Page descriptions keep a (65ch) measure.
- **Label:** form labels use the label role; badges are (0.69rem, weight 500). Workspace label, mode note, composer footnote, trial label and message time are finally floored at (max(0.75rem, 12px)). This floor is not a universal minimum for every small label.
- **Comparison:** before/proposed text uses the comparison role with whitespace and long-word preservation. Inline code uses the browser monospace face; no separate branded mono family is shipped.

**The Reading First Rule.** Use Work Sans for manuscript comparisons and supporting text; reserve Outfit for headings and the precise outlined identity.

## Layout

Welcome surfaces use an expansive centered heading/action above a semantic-paper scene, not a miniature app card. The header caps at (1660px); the scene uses (94%) width capped at (1560px), with (66%) paper toward the left and a (36%) robot on the right. The scene height is (clamp(390px, 34vw, 540px)), reduced to (clamp(360px, 30vw, 440px)) on short desktops. This is a welcome composition, not a universal page grid.

The role showcase and three-step revision journey use (90%) width capped at (1400px). Four purpose buttons form one row; the selected role opens a two-column text/character scene with an illustrative conversation bubble. A four-creature lineup joins the final team-entry invitation. At (1000px), welcome spacing/art compresses. At (700px), purpose buttons become a two-by-two grid; welcome paper spans the scene above the robot, and showcase, journey and crew invitation stack. The phone scene uses (calc(100% - 36px)) width and (620px) height so controls and character have their own space. Decorative airflow can extend beyond the scene, while content stays within the viewport.

Sign-in is a task-focused two-column surface at (94%) width capped at (1460px), with a form capped at (510px). The character stage is (420px) high. On phones the character remains above the form in a (225px) stage with (180px by 155px) art; story heading/paragraph are hidden, while task instructions, note and Pause remain available.

The workspace retains its (250px) sidebar, (78px) top bar and body capped at (1450px). Chat narrows to (880px); review starts with a (260px) proposal rail. At (1200px), workspace padding contracts and comparisons stack. At (950px), sidebar width becomes (215px), the review rail becomes a horizontal scroll list, and sources/settings stack. At (700px), the sidebar becomes a hidden, noninteractive off-canvas drawer when closed; Chat/Review/History use fixed safe-area-aware bottom navigation. The mobile composer stays in document flow so long proposals keep their reading room. While an answer is running, a fixed “Add guidance” shortcut sits above bottom navigation (bottom calc(76px + env(safe-area-inset-bottom)), right 16px); it scrolls to and focuses the real composer without animated scrolling. After messages begin, a small (38px by 44px) role indicator leaves room for conversation.

Repeated gaps are (8, 12, 18, 24, 36 and 48px), not a fully enforced spacing scale. Agent options retain two (minmax(0, 1fr)) columns with (15px) gaps and a full-width Model field, stacking at (700px) with (14px) panel padding. Long manuscript text wraps. Scope/source popovers use bounded viewport widths and scrollable contents. General buttons and preview controls have (44px minimum height); send remains (42px square).

## Elevation & Depth

Depth is a hybrid of tonal surfaces, thin borders and selective diffuse shadows. The welcome preview and sign-in card use the theme-aware ambient shadow; the composer has a lower, tighter shadow. Fine dividers carry most workspace structure. Open cobalt airflow paths, solar glints and a soft floor halo connect the welcome scene. These are environmental accents, not workspace chrome.

- **Ambient light:** (`0 22px 65px -28px #172b4d40`).
- **Ambient dark:** (`0 25px 65px -25px #0009`).
- **Composer:** (`0 8px 26px -17px #172b4d50`).
- **Illustrative paper:** (`0 28px 60px -30px #162d5259`), dark (`0 28px 65px -25px #0009`).
- **Main robot:** (`drop-shadow(0 22px 16px #30260f20)`).
- **Role character / conversation bubble:** (`drop-shadow(0 26px 15px #00000014)`) / (`0 20px 40px -23px #152d5250`).

**The Quiet Workbench Rule.** Use tone and dividers for routine workspace structure; reserve ambient shadows for floating surfaces, the composer and welcoming illustrations.

## Shapes

Soft rectangles connect the workbench to the rounded companion without making every panel a pill. Buttons and comparisons use the button radius; fields, navigation, popovers, illustration and panel radii remain distinct in frontmatter. Theme and avatar controls are circular. The global `--radius` declaration is (14px), but components frequently declare their own radii; do not assume it governs every surface. Borders use a single (1px) theme-aware rule.

## Components

### Buttons and keyboard states

Primary buttons use solar action with dark text. Subtle buttons use quiet neutral fills and turn soft/cobalt on hover. Destructive buttons use error text and error fill. General buttons use (44px minimum height), button radius, (10px 18px) padding, weight (500), and a (0.18s) transition of background, color, shadow and transform. Primary hover retains a slight (-1px) lift. Disabled buttons reduce opacity to (0.5) and use a not-allowed cursor. Text buttons are cobalt; icon buttons are (44px circles).

Keyboard focus is a (3px) cobalt outline with (4px) offset on buttons, links, summaries and standard inputs. The composer uses a cobalt border on focus-within and suppresses the inner textarea outline. A skip link becomes visible when focused.

### Fields and composer

Fields use ground fill, ink text, a line border, field radius and (12px 13px) padding with (46px minimum height). Labels are above the control. Error messages are separate alert notices rather than an invented invalid-field border system. The composer is a surface panel with a soft shadow, border and (18px 18px 12px) padding; its textarea expands vertically. Optional section/source selectors sit beside a gold send control. No section selected reads “Let the agent find it”; protected sections are disabled and labeled. Text guidance remains writable while an answer is running. Delivery status distinguishes “Sending guidance…”, “Delivered to the active answer”, “Queued for the next answer” and “Included in the following answer”; typing or queueing alone does not imply active delivery. Attach/paste actions may remain unavailable during work.

### Navigation and status

The three primary destinations are Chat, Review changes and History; sources, equations, school formatting and print review sit in a second tools group, with account/team settings anchored below. Sidebar hover uses subtle fill; active navigation uses sun-soft and solar-ink. Mobile primary navigation uses cobalt active icons/text. Review counts and dates use tabular numerals. Status badges use neutral, success, error or solar fills with a text state; underscores are displayed as spaces.

### Document review and tools

Before/proposed comparison panels use subtle/soft tones rather than a universal red/green diff. In chat, the exact changes sit inline in the conversation with vertically stacked Before and Proposed panels, section labels and reason/source evidence. Risk text calls out removals, scope changes and substantial wording; removed text has its own disclosure. After the whole batch, one solar “Approve and apply this batch” action carries the deliberate human acknowledgment that the member read every change, including removals and source limitations. This conversation flow requires no per-change checkbox, paragraph selection or written justification. The guarded request remains bound to the current preview hash, manuscript revision and actor; the button shows “Applying and verifying…” while busy. A blocked proposal offers refresh. Applied content shows “Native content verified” separately from “PDF layout still needs checking” or “PDF layout reviewed”, with a “Check PDF layout” action. Older review jobs can still open the separate Review changes view; their existing controls are not the conversation approval contract. Empty, loading, busy, error, rejected, validation, layout-review and completed states are represented through text, notices and disabled actions. History uses a dated timeline. Sources use selectable rows and a bounded detail area; formatting uses sampled rule rows, equations use disclosures, and print review groups the exact PDF, page range, checks and notes.

### Agent options, conversation spaces and Help

“Agent & space options” is a native disclosure above the composer. Its neutral rounded panel groups native select controls for optional manuscript task, new-space purpose, helper role, personal model and advertised reasoning effort. Conversation is the default task, with the task selector inside this disclosure rather than a required setup step. Completed answers place the research workbench behind an optional “Research details & figure instructions” disclosure. Known required sources are included and retained automatically; optional additional scope/source choices do not become a mandatory mapping task. Visual fixtures establish the displayed contract, not live source-service acceptance. The Model field occupies the full desktop row; the remaining fields use two columns and all fields stack on phones. The default model is labeled GPT-6.1 Sol / High; “Load my models” retrieves the member’s personal runtime list. Reasoning appears only for a chosen model and uses that model’s advertised efforts. Loading/busy states disable the reload action. Plan or quota may reject a listed model; the notice explicitly says no fallback account is used.

Four purposes are offered when creating a conversation: Manuscript editing, Defense coach, Questions and Prototype planning. Six helper roles are shown: Thesis editor, Equation reviewer, Evidence checker, Defense coach, Questions and Prototype planner. Discussion purposes lock the corresponding helper; manuscript discussions permit role selection. Active conversations show a purpose badge and, when applicable, “Branched conversation.” Branch conversation is a text action disabled while busy or running. Spaces and branches share the same Google Doc and sources; they do not create Docs copies or Git worktrees. Only manuscript space supports manuscript proposals. These are interface contracts, not claims that a particular personal model or live account passed acceptance.

Help & guide uses the same workbench shell as a Read surface: a short ordered first-session guide (75ch), one start-conversation action, then native topic disclosures (80ch). Fine top dividers, Outfit summaries (1.2rem), and muted Work Sans paragraphs/definitions (0.9rem, 1.8 line height) support scanning. The team-test and Google Docs update topics open by default. The six-step team test covers invitations/phone access, individual ChatGPT connection, discussion guards, one small duplicate update with native/PDF review, shared actor history and separate maintained-copy activation; these are instructions, not completed acceptance evidence. The first-session guide points to Chat character choices and advanced Agent & space options. Ordered disclosure lists use (22px) left padding and (18px 0) margin; items use (18px) bottom spacing, (4px) left padding and the existing muted reading style (0.9rem, 1.8 line height), with ink-colored bold leads (weight 500). Guidance covers individual setup/authorization, the deliberate update sequence, model rejection, roles/spaces/branching, prototype planning and unresolved DP1 decisions, sources/equations/formatting/printing/history, and recovery. It keeps prototype ideas distinct from completed tests and leaves Gantt/software integration as future work.

### Illustrated welcome and role companions

The welcome comparison is semantic HTML, explicitly labelled “Illustrative workflow” and “Example only · no manuscript update.” It starts on Review and cycles Ask/Review/Apply every (6200ms); native step buttons use `aria-pressed`, and manual selection pauses the cycle. The original SolAir robot is the main host and general sign-in character. Clicking it plays a (0.9s) greeting with polite live text cleared after (2400ms). Robot/sign-in idle uses (6s ease-in-out); role showcase idle uses (7s ease-in-out). Role wording stays sharp and stable. Paper step entry uses a (0.6s) reveal, with no reveal when paused.

Solar glints use (4s ease-in-out alternate). Open SVG airflow uses dash travel at (8s linear), with a second stream at (10s), offset (-4s); the turbine rotates at (8s linear). The paper scene, role showcase and sign-in each have their own Pause/Play. The shared scene hook stops motion when paused, under reduced motion, offscreen (IntersectionObserver threshold 0.05), or in a hidden tab. Sign-in also stops for busy/error form states. Reduced-motion CSS removes scene animation/transitions; manual preview selection remains usable.

Purpose selection is a labelled native button group, not an ARIA tab widget. `aria-pressed` identifies the selected purpose. The yellow bird edits Manuscript, purple cat coaches Defense, pink axolotl supports Questions, and blue snail plans Prototype. Each has distinct artwork, a purpose description, example response and entry action; the conversation bubble is labelled illustrative. The final lineup shows all four supporting creatures. Owl, human, cloud, beaver and recolored robot variants are superseded, not shipping cast.

A selected purpose survives sign-in through the whitelisted `solair-entry-space` sessionStorage value, then is consumed when Chat initializes. General entry clears it and uses the original robot. No credentials are stored in that role intent. Chat home offers the four purposes and editable starters; after messages begin, the companion contracts to a small purpose indicator. Purpose intent does not bypass authentication or change the backend manuscript write guard. Discussion spaces remain discussion-only.

The stored `solair-theme` choice persists across views and reloads, falling back to the OS preference on first use.

### Setup guidance, identity and provenance

The sign-in form switches among connecting, local-laptop mode, first owner setup, invitation join, existing account login and already-signed-in continuation. First setup includes an ordered host-terminal instruction, copy-command action and private-key field; it distinguishes the owner's setup key from teammate invitations. Existing login offers a disclosure explaining workspace credentials and personal ChatGPT connection in Settings. These are UI states, not evidence that real consent occurred.

The second logo is an inline vector wordmark with precise outlined letterforms, a gold sunrise and cobalt airflow emblem. `public/assets/solair-wordmark.svg` and `solair-mark.svg` are companion vector assets; `solair-logo-reference.png` is the user's supplied reference and is not the rendered wordmark. The gold Sol / cobalt Air split stays readable at header, sidebar, footer and preview sizes.

`public/assets/solair-companion.png` is an original AI-generated transparent cream/cobalt robot with gold solar antenna, turbine, solar backpack and notebook. It is decorative, not the research prototype. `public/assets/PROVENANCE.md` records its origin and the user-supplied logo reference. The PNG embeds an `impeccable:prompt` text chunk naming its original OpenAI image_gen origin, source image and decorative role; the exact generation prompt is retained in the conversation, not reproduced as an invented prompt here. The four supporting PNGs (`companion-manuscript.png`, `companion-defense.png`, `companion-questions.png`, `companion-prototype.png`) are original built-in image_gen assets; `public/assets/role-companions-provenance.json` records their exact generation prompts and each PNG embeds its metadata. These decorative creatures do not represent tested hardware or research results. Outfit and Work Sans are distributed with `public/assets/fonts/outfit-OFL.txt` and `worksans-OFL.txt` (SIL Open Font License 1.1); preserve those files when redistributing fonts. No broader license or trademark ownership is asserted here.

## Do's and Don'ts

### Do:

- **Do** preserve the mixed-case SolAir name, solar/wind emblem and gold/cobalt relationship.
- **Do** carry both theme states through backgrounds, text, borders and feedback.
- **Do** keep exact inline before/proposed wording and reason/source evidence readable before the one deliberate batch approval action; show native and PDF verification separately.
- **Do** keep each illustrated scene pausable and static under reduced motion, offscreen and hidden-tab states.
- **Do** retain the original robot host and the distinct yellow bird, purple cat, pink axolotl and blue snail supporting cast.
- **Do** retain asset provenance and the bundled font licenses.

### Don't:

- **Don't** restore the rejected hand-drawn wordmark or copy reference-site mascots.
- **Don't** present the animated example or generated companion as research evidence.
- **Don't** turn mock review states into claims of live account consent, cloud deployment or successful manuscript writes.
- **Don't** make automatic section finding depend on choosing paragraphs or mandatory manual scope.

### Solar/wind travelling lights

The shared EnergyFlow scene now carries a small glowing gold dot and cobalt dot with short trails along the crossing solar and airflow paths. SVG dash animation adds no dependency or layout work. Both follow existing scene pause, offscreen/hidden-tab and reduced-motion handling. Desktop/phone and both themes were checked.

### Personal allowance and reported research activity

The chat composer and Settings include a compact expandable My AI allowance row. Reported windows use a native meter, percentages left, local reset times and checked timestamp; missing data is explicitly unavailable. Solar text warns at80% used. The running answer shows its actual model/effort, coarse reported phase and public searches/pages in a bounded expandable log, retained after completion. No invented live activity or private reasoning text. Both themes and phone widths retain existing tokens and readable controls.
