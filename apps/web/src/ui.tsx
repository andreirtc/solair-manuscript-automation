import React, { useEffect, useState } from "react";
import { api } from "./api";
export function Logo() {
  return (
    <svg
      className="wordmark"
      viewBox="0 0 228 78"
      role="img"
      aria-label="SolAir"
    >
      <title>SolAir — solar and wind</title>
      <g fill="none" strokeLinecap="round" strokeWidth="2.3">
        <path
          stroke="var(--sun)"
          d="M23 12V6M8 17l-4-4M38 17l4-4M3 31H0M43 31h3"
        />
        <path
          stroke="var(--brand)"
          d="M2 44C14 35 25 50 43 39M5 52C17 44 26 57 39 49M12 59C23 54 28 61 34 57"
        />
      </g>
      <path fill="var(--sun)" d="M6 36a17 17 0 0 1 34 0C28 45 19 29 6 36Z" />
      <path
        fill="var(--sun)"
        d="M74.49825 61.67725Q69.08025 61.67725 65.2018125 59.8699375Q61.323375 58.062625 58.1655 54.408625L64.189875 48.38425Q66.253125 50.912125 68.844 52.298125Q71.434875 53.684125 75.03375 53.684125Q78.286125 53.684125 80.1406875 52.4438125Q81.99525 51.2035 81.99525 49.03Q81.99525 47.132125 80.86125 45.9233125Q79.72725 44.7145 77.86875 43.871875Q76.01025 43.029250000000005 73.77375 42.2929375Q71.53725 41.556625 69.3125625 40.5840625Q67.087875 39.6115 65.229375 38.1664375Q63.370875 36.721374999999995 62.236875 34.480937499999996Q61.102875 32.2405 61.102875 28.862125Q61.102875 24.790750000000003 63.083437499999995 21.896687500000002Q65.064 19.002625000000002 68.529 17.4709375Q71.994 15.939250000000001 76.427625 15.939250000000001Q81.03450000000001 15.939250000000001 84.79875000000001 17.6048125Q88.563 19.270375 90.964875 22.0345L84.916875 28.058875Q82.956 25.964125000000003 80.89668750000001 24.94825Q78.83737500000001 23.932375 76.26225 23.932375Q73.482375 23.932375 71.88374999999999 24.9955Q70.285125 26.058625 70.285125 28.027375Q70.285125 29.7835 71.419125 30.87025Q72.553125 31.957 74.411625 32.748437499999994Q76.27012500000001 33.539874999999995 78.506625 34.295874999999995Q80.74312499999999 35.051874999999995 82.9678125 36.032312499999996Q85.1925 37.01275 87.051 38.540499999999994Q88.90950000000001 40.06825 90.04350000000001 42.422875000000005Q91.17750000000001 44.7775 91.17750000000001 48.258250000000004Q91.17750000000001 54.534625 86.728125 58.105937499999996Q82.27875 61.67725 74.49825 61.67725Z M109.62174999999999 61.67725Q104.951875 61.67725 101.2073125 59.56675Q97.46275 57.45625 95.281375 53.818Q93.1 50.17975 93.1 45.67525Q93.1 41.17075 95.26956249999999 37.5955Q97.43912499999999 34.020250000000004 101.18368749999999 31.909750000000003Q104.92824999999999 29.79925 109.598125 29.79925Q114.307375 29.79925 118.04012499999999 31.8900625Q121.772875 33.980875 123.95425 37.5758125Q126.135625 41.17075 126.135625 45.67525Q126.135625 50.17975 123.96606249999999 53.818Q121.7965 57.45625 118.06375 59.56675Q114.33099999999999 61.67725 109.62174999999999 61.67725ZM109.598125 53.44Q111.803125 53.44 113.48049999999999 52.463499999999996Q115.15787499999999 51.487 116.0831875 49.726937500000005Q117.0085 47.966875 117.0085 45.698875Q117.0085 43.430875 116.0516875 41.7101875Q115.094875 39.9895 113.449 39.013000000000005Q111.803125 38.036500000000004 109.598125 38.036500000000004Q107.456125 38.036500000000004 105.77875 39.0248125Q104.10137499999999 40.013125 103.16425 41.7338125Q102.227125 43.454499999999996 102.227125 45.7225Q102.227125 47.966875 103.16425 49.726937500000005Q104.10137499999999 51.487 105.77875 52.463499999999996Q107.456125 53.44 109.598125 53.44Z M129.43625 61.0V15.356499999999997H138.398V61.0Z"
      />
      <path
        fill="var(--brand)"
        d="M141.31275 61.0 159.055125 16.616500000000002H167.02462500000001L184.617375 61.0H174.820875L161.2995 24.38125H164.65425L150.936 61.0ZM151.062 52.849375V45.226375H175.072875V52.849375Z M187.54 61.0V30.4765H196.50175000000002V61.0ZM192.020875 25.924750000000003Q189.9025 25.924750000000003 188.50074999999998 24.4796875Q187.099 23.034625 187.099 20.916249999999998Q187.099 18.797874999999998 188.50074999999998 17.3528125Q189.9025 15.90775 192.020875 15.90775Q194.20225 15.90775 195.5725 17.3528125Q196.94275 18.797874999999998 196.94275 20.916249999999998Q196.94275 23.034625 195.5725 24.4796875Q194.20225 25.924750000000003 192.020875 25.924750000000003Z M201.82625 61.0V30.4765H210.78799999999998V61.0ZM210.78799999999998 44.202625 207.141875 41.540875Q208.039625 36.067750000000004 210.8272300613497 32.957125000000005Q213.6148351226994 29.8465 218.639375 29.8465Q220.86012499999998 29.8465 222.58081249999998 30.547375Q224.3015 31.24825 225.64024999999998 32.7445L220.2065 39.34375Q219.52925 38.6035 218.5776875 38.2373125Q217.626125 37.871125 216.37924999999998 37.871125Q213.85925 37.871125 212.323625 39.43230660377358Q210.78799999999998 40.99348820754717 210.78799999999998 44.202625Z"
      />
    </svg>
  );
}

const paths: Record<string, string> = {
  chat: "M21 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 18-3 M7 10h8M7 14h5",
  review: "M8 3H4v18h16V3h-4M8 2h8v4H8z M8 13l3 3 6-7",
  history: "M3 11a9 9 0 1 1 2 7M3 4v7h7 M12 7v6l4 2",
  plus: "M12 5v14M5 12h14",
  arrow: "M5 12h14m-6-6 6 6-6 6",
  sun: "M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1 M16 12a4 4 0 1 1-8 0 4 4 0 1 1 8 0",
  moon: "M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z",
  settings:
    "M9 3l-1 3-3 1-2 3 2 2-1 4 3 2h3l2 3 3-1 1-3 4-1 1-3-2-3V7l-3-2-3 1Z M15 12a3 3 0 1 1-6 0 3 3 0 1 1 6 0",
  file: "M14 2H5v20h14V7Z M14 2v6h5M8 12h8M8 16h8",
  sources: "M4 5h6l2 3h9v13H3V5z M12 12v6m-3-3h6",
  equation: "M18 3H8l7 9-7 9h10M4 7v10",
  layout: "M3 3h18v18H3z M3 8h18M9 8v13M12 12h6M12 16h6",
  print: "M6 9V2h12v7M6 17H3V9h18v8h-3M6 14h12v8H6z M17 11h1",
  close: "M6 6l12 12M6 18 18 6",
  menu: "M4 6h16M4 12h16M4 18h16",
  check: "M5 12l4 4L19 6",
  link: "M14 3h7v7M21 3 11 13M10 3H3v18h18v-7",
  refresh: "M20 7a9 9 0 1 0 1 8M21 2v6h-6",
  shield: "M12 2l9 4v6c0 5-9 10-9 10S3 17 3 12V6Z M8 12l3 3 5-6",
  send: "M3 3l19 9-19 9 4-9zM7 12h15",
  chevron: "M8 5l7 7-7 7",
  logout: "M10 3H3v18h7M9 12h13m-5-5 5 5-5 5",
};
export function Icon({
  name,
  ...p
}: { name: string } & React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...p}
    >
      <path d={paths[name] || paths.file} />
    </svg>
  );
}
export function ThemeSwitch() {
  const [dark, setDark] = useState(() =>
    localStorage.getItem("solair-theme")
      ? localStorage.getItem("solair-theme") === "dark"
      : matchMedia("(prefers-color-scheme: dark)").matches,
  );
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("solair-theme", dark ? "dark" : "light");
  }, [dark]);
  return (
    <button
      className="icon-button"
      onClick={() => setDark(!dark)}
      aria-label={"Switch to " + (dark ? "light" : "dark") + " mode"}
      title={"Switch to " + (dark ? "light" : "dark") + " mode"}
    >
      <Icon name={dark ? "sun" : "moon"} />
    </button>
  );
}
export function Notice({
  error,
  children,
}: {
  error?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={"notice " + (error ? "error" : "")}
      role={error ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
export function Empty({
  title,
  children,
  icon = "file",
}: {
  title: string;
  children?: React.ReactNode;
  icon?: string;
}) {
  return (
    <div className="empty">
      <Icon name={icon} />
      <h3>{title}</h3>
      {children && <div>{children}</div>}
    </div>
  );
}
export function useResource<T>(path: string) {
  const [data, setData] = useState<T>(),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  async function reload() {
    setError("");
    setLoading(true);
    try {
      setData(await api<T>(path));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void reload();
  }, [path]);
  return { data, error, loading, reload, setData };
}
export function useAction() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return { busy, error, notice, setNotice, run };
}
export function Feedback({ action }: { action: ReturnType<typeof useAction> }) {
  return (
    <>
      {action.error && <Notice error>{action.error}</Notice>}
      {action.notice && <Notice>{action.notice}</Notice>}
    </>
  );
}
export function DateLabel({ value }: { value: string }) {
  return (
    <time dateTime={value}>
      {new Date(value).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      })}
    </time>
  );
}
export function Badge({ value }: { value: string }) {
  return <span className={"badge " + value}>{value.replaceAll("_", " ")}</span>;
}
export function PageHead({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children && <div className="actions">{children}</div>}
    </header>
  );
}
