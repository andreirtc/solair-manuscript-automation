import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import type { TeamStatus } from "../../../packages/contracts/index";
import { api } from "./api";
import { Logo, Icon, ThemeSwitch, Notice, Feedback, useAction } from "./ui";
import { Workspace } from "./workspace";
import "./style.css";
import "./refresh.css";
import { WelcomePage } from "./welcome";
import {
  entrySpace,
  rememberEntrySpace,
  WelcomeCharacter,
  clearEntrySpace,
  hasEntrySpace,
} from "./companions";
export function navigate(path: string) {
  history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo(0, 0);
}
function SignIn({
  state,
  recheck,
}: {
  state?: TeamStatus;
  recheck: () => Promise<void>;
}) {
  const a = useAction(),
    [join, setJoin] = useState(false),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [name, setName] = useState(""),
    [code, setCode] = useState("");
  const setup = state?.enabled && !state.configured;
  return (
    <div className="auth-page">
      <header className="site-header">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
        >
          <Logo />
        </a>
        <ThemeSwitch />
      </header>
      <main id="main" className="auth-main">
        <div className="auth-story">
          <h1>
            A fresh start
            <br />
            for your next revision.
          </h1>
          <p>
            Your manuscript, your evidence and your team—all in one thoughtful
            workspace.
          </p>
          <WelcomeCharacter
            space={entrySpace()}
            brand={!hasEntrySpace()}
            pausedForForm={a.busy || !!a.error}
          />
        </div>
        <section className="auth-form">
          <h2>
            {setup
              ? "Create your workspace"
              : join
                ? "Join your team"
                : "Welcome back."}
          </h2>
          <p>
            {setup
              ? "The host’s private setup key creates the first owner account."
              : join
                ? "Use the one-use invitation your team owner shared."
                : "Sign in to pick up where your team left off."}
          </p>
          {setup ? (
            <div className="setup-guide">
              <h3>First time? Start here.</h3>
              <ol>
                <li>
                  <b>On the host laptop:</b> open an Orca terminal and run this
                  command to read the private setup key.
                  <code>
                    cat
                    .local/team-bootstrap.txt
                  </code>
                  <button
                    className="text-button"
                    onClick={() =>
                      void a.run(async () => {
                        await navigator.clipboard.writeText(
                          "cat .local/team-bootstrap.txt",
                        );
                        a.setNotice(
                          "Command copied. Paste it in the host laptop’s Orca terminal, then copy its output into Private setup key below.",
                        );
                      })
                    }
                  >
                    Copy setup command <Icon name="file" />
                  </button>
                </li>
                <li>
                  <b>Create your owner account</b> using the key below. Choose
                  your own workspace username and password.
                </li>
                <li>
                  <b>After sign-in:</b> open Settings to connect your ChatGPT
                  and create one-use invitations for the other three members.
                </li>
              </ol>
              <p>
                Only the first owner needs this setup key. Teammates join with
                invitations; keep the setup key private.
              </p>
            </div>
          ) : (
            <details className="login-guide">
              <summary>How do I sign in?</summary>
              <p>
                Use the workspace username and password you created here. If
                you’re new, ask the owner for a one-use invitation and choose “I
                have an invitation.” After joining, connect your own ChatGPT in
                Settings.
              </p>
            </details>
          )}
          <Feedback action={a} />
          {!state ? (
            <Notice>Connecting to the workspace…</Notice>
          ) : !state.enabled ? (
            <>
              <Notice>
                Local laptop mode is active. Team sign-in is not enabled on this
                server.
              </Notice>
              <button
                className="button primary"
                onClick={() => navigate("/app")}
              >
                Continue on this laptop <Icon name="arrow" />
              </button>
            </>
          ) : state.actor ? (
            <button className="button primary" onClick={() => navigate("/app")}>
              Continue as {state.actor.name} <Icon name="arrow" />
            </button>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void a.run(async () => {
                  await api(
                    setup ? "/auth/setup" : join ? "/auth/join" : "/auth/login",
                    setup
                      ? { key: code, name, username, password }
                      : join
                        ? { code, name, username, password }
                        : { username, password },
                  );
                  setPassword("");
                  setCode("");
                  await recheck();
                  navigate("/app");
                });
              }}
            >
              {(setup || join) && (
                <>
                  <label>
                    {setup ? "Private setup key" : "Invitation code"}
                    <input
                      type="password"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                      autoComplete="off"
                      required
                      minLength={32}
                    />
                  </label>
                  <label>
                    Your name
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      autoComplete="name"
                      maxLength={80}
                      required
                    />
                  </label>
                </>
              )}
              <label>
                Workspace username
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  minLength={3}
                  maxLength={32}
                  pattern="[a-zA-Z0-9_-]+"
                  required
                />
              </label>
              <label>
                Workspace password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={
                    setup || join ? "new-password" : "current-password"
                  }
                  minLength={setup || join ? 12 : 1}
                  maxLength={128}
                  required
                />
              </label>
              {(setup || join) && (
                <small>
                  Choose a separate password with at least 12 characters.
                </small>
              )}
              <button className="button primary full" disabled={a.busy}>
                {a.busy
                  ? "Signing in…"
                  : setup
                    ? "Create workspace"
                    : join
                      ? "Join workspace"
                      : "Sign in"}
                <Icon name="arrow" />
              </button>
              {!setup && (
                <button
                  className="text-button"
                  type="button"
                  onClick={() => setJoin(!join)}
                >
                  {join ? "I already have an account" : "I have an invitation"}
                </button>
              )}
            </form>
          )}
          <p className="auth-footnote">
            This is your workspace sign-in. Connect your own ChatGPT account
            separately in Settings; never enter its password here.
          </p>
        </section>
      </main>
    </div>
  );
}
function App() {
  const [route, setRoute] = useState(location.pathname),
    [state, setState] = useState<TeamStatus>(),
    [error, setError] = useState("");
  async function recheck() {
    try {
      setState(await api<TeamStatus>("/auth/status"));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void recheck();
    const change = () => setRoute(location.pathname),
      auth = () => {
        void recheck();
        navigate("/sign-in");
      };
    window.addEventListener("popstate", change);
    window.addEventListener("solair:sign-in-required", auth);
    return () => {
      window.removeEventListener("popstate", change);
      window.removeEventListener("solair:sign-in-required", auth);
    };
  }, []);
  useEffect(() => {
    if (route.startsWith("/app") && state?.enabled && !state.actor)
      navigate("/sign-in");
  }, [route, state]);
  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {error && route !== "/" && (
        <div className="connection-error">
          <Notice error>
            {error} <button onClick={() => void recheck()}>Retry</button>
          </Notice>
        </div>
      )}
      {route === "/" ? (
        <WelcomePage
          enter={(space) => {
            if (space) rememberEntrySpace(space);
            else clearEntrySpace();
            navigate("/sign-in");
          }}
        />
      ) : route === "/sign-in" ? (
        <SignIn state={state} recheck={recheck} />
      ) : state && (!state.enabled || state.actor) ? (
        <Workspace route={route} state={state} recheck={recheck} />
      ) : (
        <SignIn state={state} recheck={recheck} />
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
