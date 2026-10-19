import React, { useEffect, useRef, useState } from "react";
import { Icon } from "./ui";
export function ScrollTour() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const nodes = root.current?.querySelectorAll(".tour-scene");
    if (!nodes) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-revealed");
            observer.unobserve(e.target);
          }
        });
      },
      { threshold: 0.2 },
    );
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={root} className="scroll-tour">
      <section className="tour-scene">
        <div>
          <h2>
            Your thoughts.
            <br />
            Room to take shape.
          </h2>
          <p>
            Give each discussion its own space. Revise the manuscript, rehearse
            your defense or work through a question without losing the thread.
          </p>
        </div>
        <div
          className="tour-spaces"
          aria-label="Illustrative conversation spaces"
        >
          <div>
            <Icon name="file" />
            <span>
              Manuscript<b>Make the explanation clearer.</b>
            </span>
            <i />
          </div>
          <div>
            <Icon name="chat" />
            <span>
              Defense coach<b>Let’s test the assumptions.</b>
            </span>
            <i />
          </div>
          <div>
            <Icon name="sources" />
            <span>
              Questions<b>Work through the hard parts.</b>
            </span>
            <i />
          </div>
          <small>Workspace preview · example conversations</small>
        </div>
      </section>
      <section className="tour-scene reverse">
        <div>
          <h2>
            See the difference.
            <br />
            Keep the decision.
          </h2>
          <p>
            A revision should make sense before it reaches the page. Read the
            wording, understand the reason and approve only what you stand
            behind.
          </p>
        </div>
        <div className="tour-document" aria-label="Illustrative change review">
          <div className="tour-document-head">
            <Icon name="review" />A change worth reading.
          </div>
          <span>Before</span>
          <p>The process is done.</p>
          <span>Proposed wording</span>
          <p className="tour-highlight">
            The team records each measurement before analysis.
          </p>
          <div className="tour-review-check">
            <Icon name="check" />
            Read. Consider. Then approve.
          </div>
          <small>Illustrative writing example · no manuscript update</small>
        </div>
      </section>
    </div>
  );
}
export function SignInAnimation() {
  const [paused, setPaused] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  return (
    <div className={"signin-scene " + (paused ? "motion-paused" : "")}>
      <div className="signin-orbit" />
      <img
        src="/assets/solair-companion.png"
        alt="SolAir companion ready for your next revision"
        width="1254"
        height="1254"
      />
      <span className="signin-scene-note">
        <Icon name="shield" />
        Your account. Your next chapter.
      </span>
      <button className="text-button" onClick={() => setPaused(!paused)}>
        {paused ? "Play welcome animation" : "Pause welcome animation"}
      </button>
    </div>
  );
}
