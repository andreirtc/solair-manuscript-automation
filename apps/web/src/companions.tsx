import React, { useEffect, useRef, useState } from "react";
import { Icon } from "./ui";

export const spaces = [
  "manuscript",
  "defense",
  "questions",
  "prototype",
] as const;
export type Space = (typeof spaces)[number];
export const companions: Record<
  Space,
  {
    label: string;
    name: string;
    description: string;
    prompt: string;
    answer: string;
    image: string;
  }
> = {
  manuscript: {
    label: "Manuscript editor",
    name: "A thoughtful eye for every word.",
    description:
      "Turn adviser feedback into a revision you understand. Read the wording, the reasoning and the evidence before it reaches your document.",
    prompt:
      "Clarify our research instrument description. Preserve the finalized SOP and flag claims that need evidence.",
    answer:
      "Let’s locate the section, check your evidence and prepare wording for you to review.",
    image: "/assets/companion-manuscript.png",
  },
  defense: {
    label: "Defense coach",
    name: "Find your voice. Know your reasoning.",
    description:
      "Rehearse the questions that matter. Explain your choices, test your assumptions and speak honestly about the work still ahead.",
    prompt:
      "Ask me one DP1 defense question at a time. Challenge my assumptions without inventing results.",
    answer:
      "Why did your team choose this approach, and what evidence would support that choice?",
    image: "/assets/companion-defense.png",
  },
  questions: {
    label: "Questions",
    name: "A little curiosity goes a long way.",
    description:
      "Untangle a difficult idea, ask a follow-up or work through a problem. Keep what you know separate from what you still need to find out.",
    prompt:
      "Help us understand a problem in our project. Explain what is known, what is uncertain and what information you need.",
    answer:
      "Tell me what happened and what you expected. We can work through it one step at a time.",
    image: "/assets/companion-questions.png",
  },
  prototype: {
    label: "Prototype planner",
    name: "Think it through. Then build it.",
    description:
      "Compare DP1 demonstration ideas and discuss your developing system. Bring component specifications, pinouts and measurements to the conversation.",
    prompt:
      "Help us compare DP1 demonstration options. Ask for exact components and ratings before suggesting a design.",
    answer:
      "Which components are confirmed, and which demonstration choices are still open?",
    image: "/assets/companion-prototype.png",
  },
};

export function entrySpace(): Space {
  const value = sessionStorage.getItem("solair-entry-space");
  return spaces.includes(value as Space) ? (value as Space) : "manuscript";
}
export function hasEntrySpace() {
  return sessionStorage.getItem("solair-entry-space") !== null;
}
export function clearEntrySpace() {
  sessionStorage.removeItem("solair-entry-space");
}

export function consumeEntrySpace(): Space {
  const value = entrySpace();
  sessionStorage.removeItem("solair-entry-space");
  return value;
}
export function rememberEntrySpace(value: Space) {
  sessionStorage.setItem("solair-entry-space", value);
}

/** Observe the scene, not the whole page, so hidden/offscreen motion stops. */
export function useSceneMotion(externalPause = false) {
  const ref = useRef<HTMLDivElement>(null);
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const [paused, setPaused] = useState(false);
  const [visible, setVisible] = useState(true);
  const [hidden, setHidden] = useState(document.hidden);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(media.matches);
    const visibility = () => setHidden(document.hidden);
    media.addEventListener("change", change);
    document.addEventListener("visibilitychange", visibility);
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { threshold: 0.05 },
    );
    if (ref.current) observer.observe(ref.current);
    return () => {
      media.removeEventListener("change", change);
      document.removeEventListener("visibilitychange", visibility);
      observer.disconnect();
    };
  }, []);
  return {
    ref,
    paused: paused || reduced,
    setPaused,
    stopped: paused || reduced || externalPause || hidden || !visible,
  };
}

export function Character({
  space,
  className = "",
  eager = false,
}: {
  space: Space;
  className?: string;
  eager?: boolean;
}) {
  return (
    <img
      className={"role-character " + className}
      src={companions[space].image}
      alt={companions[space].label + " companion"}
      width="1280"
      height="1280"
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "auto"}
    />
  );
}

export function BrandCompanion({
  className = "",
  eager = false,
}: {
  className?: string;
  eager?: boolean;
}) {
  return (
    <img
      className={"role-character brand-companion " + className}
      src="/assets/solair-companion.png"
      alt="SolAir solar-and-wind robot companion"
      width="1254"
      height="1254"
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : "auto"}
    />
  );
}

export function EnergyFlow() {
  return (
    <div className="energy-flow" aria-hidden="true">
      <div className="solar-light">
        <i />
        <i />
        <i />
      </div>
      <svg
        className="air-stream"
        viewBox="0 0 1100 440"
        fill="none"
        preserveAspectRatio="none"
      >
        <path
          className="air-base"
          d="M-30 280C210 390 300 80 540 145S850 400 1140 180"
        />
        <path
          className="air-travel energy-trail wind-pulse"
          pathLength="1200"
          d="M-30 280C210 390 300 80 540 145S850 400 1140 180"
        />
        <path
          className="energy-spark wind-pulse"
          pathLength="1200"
          d="M-30 280C210 390 300 80 540 145S850 400 1140 180"
        />
        <path
          className="air-base solar-stream"
          d="M-25 110C230 20 370 320 620 250S880 30 1140 175"
        />
        <path
          className="energy-trail solar-pulse"
          pathLength="1200"
          d="M-25 110C230 20 370 320 620 250S880 30 1140 175"
        />
        <path
          className="energy-spark solar-pulse"
          pathLength="1200"
          d="M-25 110C230 20 370 320 620 250S880 30 1140 175"
        />
        <path
          className="air-base second"
          d="M-50 320C200 430 340 140 555 185S880 450 1150 220"
        />
        <path
          className="air-travel second"
          d="M-50 320C200 430 340 140 555 185S880 450 1150 220"
        />
        <path
          className="air-base third"
          d="M-25 210C230 340 330 20 600 75S880 320 1140 110"
        />
      </svg>
      <svg className="energy-turbine" viewBox="0 0 100 150" fill="none">
        <path
          d="M50 55v85M28 142h44"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <g className="turbine-blades" fill="currentColor">
          <path d="M50 55C34 28 44 7 51 5c7 10 8 29-1 50Z" />
          <path d="M50 55c31-1 45 16 45 24-12 3-30-4-45-24Z" />
          <path d="M50 55C35 81 12 84 5 80c4-12 19-24 45-25Z" />
        </g>
        <circle cx="50" cy="55" r="5" fill="var(--sun)" />
      </svg>
    </div>
  );
}

export function SpaceChoices({
  value,
  onChange,
  compact = false,
}: {
  value: Space;
  onChange: (space: Space) => void;
  compact?: boolean;
}) {
  return (
    <div
      className={"space-choices " + (compact ? "compact" : "")}
      role="group"
      aria-label="Choose your conversation space"
    >
      {spaces.map((space) => (
        <button
          key={space}
          type="button"
          aria-pressed={value === space}
          onClick={() => onChange(space)}
          data-space={space}
        >
          <img
            src={companions[space].image}
            alt=""
            width="64"
            height="64"
            loading="lazy"
          />
          <span>{companions[space].label}</span>
        </button>
      ))}
    </div>
  );
}

export function RoleShowcase({ enter }: { enter: (space: Space) => void }) {
  const [space, setSpace] = useState<Space>("manuscript");
  const motion = useSceneMotion();
  const c = companions[space];
  return (
    <section
      className="role-showcase"
      id="your-team"
      aria-labelledby="role-heading"
      data-space={space}
    >
      <div className="showcase-heading">
        <h2 id="role-heading">
          Different strengths.
          <br />
          One place to think together.
        </h2>
        <p>
          A careful editor, a practice partner, a curious mind and a builder.
          Choose the space your next thought needs.
        </p>
      </div>
      <SpaceChoices value={space} onChange={setSpace} />
      <div
        ref={motion.ref}
        className={"showcase-stage " + (motion.stopped ? "motion-paused" : "")}
      >
        <div className="showcase-copy" key={space + "-copy"}>
          <h3>{c.name}</h3>
          <p>{c.description}</p>
          <button className="button primary" onClick={() => enter(space)}>
            Start with {c.label.toLowerCase()} <Icon name="arrow" />
          </button>
          <small>
            {space === "manuscript"
              ? "Every manuscript change needs your review."
              : "A discussion space. No manuscript edits."}
          </small>
        </div>
        <div className="showcase-art" key={space}>
          <Character space={space} />
          <div className="showcase-bubble">
            <Icon name="chat" />
            <p>{c.answer}</p>
            <small>Illustrative conversation</small>
          </div>
        </div>
      </div>
      <button
        className="text-button scene-pause"
        onClick={() => motion.setPaused(!motion.paused)}
      >
        {motion.paused
          ? "Play character animation"
          : "Pause character animation"}
      </button>
    </section>
  );
}

export function WelcomeCharacter({
  space,
  pausedForForm = false,
  brand = false,
}: {
  space: Space;
  pausedForForm?: boolean;
  brand?: boolean;
}) {
  const motion = useSceneMotion(pausedForForm);
  return (
    <div
      ref={motion.ref}
      className={
        "signin-scene welcome-character " +
        (motion.stopped ? "motion-paused" : "")
      }
      data-space={space}
    >
      <EnergyFlow />
      {brand ? <BrandCompanion eager /> : <Character space={space} eager />}
      <span className="signin-scene-note">
        <Icon name="shield" /> {companions[space].label} · Your next chapter.
      </span>
      <button
        className="text-button"
        onClick={() => motion.setPaused(!motion.paused)}
      >
        {motion.paused ? "Play welcome animation" : "Pause welcome animation"}
      </button>
    </div>
  );
}
