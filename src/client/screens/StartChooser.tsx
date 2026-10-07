import { useState } from "react";
import { InstallOffer } from "../install";
import { lastTable } from "../pwa";

const storage = () => {
  try {
    return localStorage;
  } catch {
    return null;
  }
};

/**
 * Start screen (the installed app's home, and a phone that opened the start page): host a game,
 * join one with its code, go back to the table this phone sat at, or use this screen as the TV.
 */
export function StartChooser() {
  const [code, setCode] = useState("");
  const back = lastTable(storage(), Date.now());
  return (
    <div className="phone chooser">
      <h1 className="wordmark">
        <span>Run</span>
        <span className="amp">Set</span>
        <span>Jimmy</span>
      </h1>
      {back ? (
        <a className="btn primary" href={back.url}>
          Back to table {back.code}
        </a>
      ) : null}
      <a className={`btn ${back ? "" : "primary"}`} href="/host">
        Host a game
      </a>
      <form
        className="join-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (/^[A-Za-z]{4}$/.test(code)) location.href = `/join/${code.toUpperCase()}`;
        }}
      >
        <label htmlFor="code">Or join with the code on the TV</label>
        <input id="code" value={code} onChange={(e) => setCode(e.target.value)} maxLength={4} autoCapitalize="characters" placeholder="ABCD" />
        <button className="btn">Join</button>
      </form>
      <a className="btn ghost" href="/?as=tv">
        Use this screen as the TV
      </a>
      <InstallOffer compact />
    </div>
  );
}
