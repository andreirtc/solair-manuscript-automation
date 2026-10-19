import React, { useEffect, useState } from "react";
import { Logo, Icon, ThemeSwitch } from "./ui";
import {
  Character,
  BrandCompanion,
  companions,
  EnergyFlow,
  RoleShowcase,
  Space,
  useSceneMotion,
} from "./companions";

function RevisionScene() {
  const motion = useSceneMotion();
  const [step, setStep] = useState(1);
  const [hello, setHello] = useState(false);
  useEffect(() => {
    if (motion.stopped) return;
    const timer = setInterval(() => setStep((value) => (value + 1) % 3), 6200);
    return () => clearInterval(timer);
  }, [motion.stopped]);
  useEffect(() => {
    if (!hello) return;
    const timer = setTimeout(() => setHello(false), 2400);
    return () => clearTimeout(timer);
  }, [hello]);
  return (
    <div
      ref={motion.ref}
      className={"revision-scene " + (motion.stopped ? "motion-paused" : "")}
    >
      <EnergyFlow />
      <div className="scene-floor" />
      <figure className="manuscript-paper">
        <div className="paper-toolbar">
          <Logo />
          <span>Illustrative workflow</span>
          <Icon name="file" />
        </div>
        <div className="paper-page" key={step}>
          {step === 0 ? (
            <>
              <h2>Start with your own words.</h2>
              <p className="paper-request">
                “Clarify this section. Keep our meaning and show me what
                changes.”
              </p>
              <div className="paper-response">
                <Icon name="chat" />
                <p>
                  Let’s find the right section and check the supporting
                  evidence.
                </p>
              </div>
            </>
          ) : step === 1 ? (
            <>
              <h2>A revision you can see.</h2>
              <p>Read the wording. Understand the reason.</p>
              <div className="paper-diff before">
                <span>Before</span>
                <del>The prototype is complete.</del>
              </div>
              <div className="paper-diff after">
                <span>Proposed</span>
                <p>
                  The prototype is under development. Design decisions remain
                  open.
                </p>
              </div>
            </>
          ) : (
            <>
              <h2>The decision stays yours.</h2>
              <p>Read every change before approving it.</p>
              <ul className="paper-checks">
                <li>
                  <Icon name="review" />
                  Review wording and evidence
                </li>
                <li>
                  <Icon name="shield" />
                  Approve, then apply separately
                </li>
                <li>
                  <Icon name="file" />
                  Keep a backup. Inspect the PDF.
                </li>
              </ul>
            </>
          )}
        </div>
        <figcaption>
          Example only · no manuscript update{" "}
          <a href="#workflow">
            How review works <Icon name="arrow" />
          </a>
        </figcaption>
      </figure>
      <button
        className={"scene-character " + (hello ? "says-hello" : "")}
        aria-label="Say hello to the SolAir companion"
        onClick={() => setHello(!hello)}
      >
        <BrandCompanion eager />
      </button>
      <span className="scene-greeting" aria-live="polite">
        {hello ? "Solar energy. A fresh perspective." : ""}
      </span>
      <div className="scene-controls">
        <div role="group" aria-label="Preview steps">
          {["Ask", "Review", "Apply"].map((label, index) => (
            <button
              key={label}
              aria-pressed={step === index}
              onClick={() => {
                setStep(index);
                motion.setPaused(true);
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className="text-button"
          onClick={() => motion.setPaused(!motion.paused)}
        >
          {motion.paused ? "Play preview" : "Pause preview"}
        </button>
      </div>
    </div>
  );
}

export function WelcomePage({ enter }: { enter: (space?: Space) => void }) {
  return (
    <div className="landing illustrated-landing">
      <header className="site-header">
        <a href="/" aria-label="SolAir home">
          <Logo />
        </a>
        <nav aria-label="Main">
          <a href="#workflow">How it works</a>
          <a href="#your-team">Meet your companions</a>
          <ThemeSwitch />
          <button className="button subtle" onClick={() => enter()}>
            Open workspace <Icon name="arrow" />
          </button>
        </nav>
      </header>
      <main id="main">
        <section className="illustrated-hero" aria-labelledby="welcome-heading">
          <div className="illustrated-hero-copy">
            <h1 id="welcome-heading">
              A clearer manuscript.
              <br />
              <span>A calmer defense.</span>
            </h1>
            <p>
              Think together. Review every change. Keep your thesis grounded in
              evidence.
            </p>
            <button className="button primary hero-cta" onClick={() => enter()}>
              Enter your workspace <Icon name="arrow" />
            </button>
          </div>
          <RevisionScene />
          <p className="scene-promise">
            <Icon name="shield" />
            Your words. Your evidence. Your decision.
          </p>
        </section>
        <RoleShowcase enter={enter} />
        <section
          className="revision-journey"
          id="workflow"
          aria-labelledby="journey-heading"
        >
          <div>
            <h2 id="journey-heading">
              From a thought
              <br />
              to a change you trust.
            </h2>
            <p>
              Use your own words. Keep the team in the loop. Take the next step
              when you’re ready.
            </p>
          </div>
          <ol>
            <li>
              <Icon name="chat" />
              <div>
                <h3>Ask naturally</h3>
                <p>
                  Describe what you need. Let the agent find the section, or
                  choose one yourself.
                </p>
              </div>
            </li>
            <li>
              <Icon name="review" />
              <div>
                <h3>Read the difference</h3>
                <p>
                  Compare the exact wording, removals and evidence. Approve what
                  you understand.
                </p>
              </div>
            </li>
            <li>
              <Icon name="shield" />
              <div>
                <h3>Apply with care</h3>
                <p>
                  Apply separately, keep a backup and inspect the document’s
                  final layout.
                </p>
              </div>
            </li>
          </ol>
        </section>
        <section className="crew-invitation">
          <div
            className="crew-lineup"
            aria-label="Four distinct SolAir companions"
          >
            {(
              ["manuscript", "defense", "questions", "prototype"] as Space[]
            ).map((space) => (
              <Character key={space} space={space} />
            ))}
          </div>
          <div>
            <h2>
              Your next chapter
              <br />
              is a team effort.
            </h2>
            <p>
              One shared workspace. Four individual accounts.
              <br />A little help for the work ahead.
            </p>
            <button className="button primary" onClick={() => enter()}>
              Let’s get to work <Icon name="arrow" />
            </button>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <Logo />
        <span>Solar energy. Fresh perspective.</span>
        <a
          href="/sign-in"
          onClick={(e) => {
            e.preventDefault();
            enter();
          }}
        >
          Open workspace <Icon name="arrow" />
        </a>
      </footer>
    </div>
  );
}
