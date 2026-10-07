import { useState } from "react";

/**
 * A phone that opened the start page in a plain browser: host a game from here (the TV page opens
 * on a laptop or TV browser), or join one with its code.
 */
export function StartChooser() {
  const [code, setCode] = useState("");
  return (
    <div className="phone chooser">
      <h1 className="wordmark">
        <span>Run</span>
        <span className="amp">Set</span>
        <span>Jimmy</span>
      </h1>
      <a className="btn primary" href="/host">
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
    </div>
  );
}
