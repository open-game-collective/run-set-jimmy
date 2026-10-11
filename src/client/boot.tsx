import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";
import { connectRoom, RoomContext } from "../room.context";
import type { Boot } from "../room.types";

/** The boot payload the Worker injected into the page: the room code, this page's signed id, and its first view. */
export function readBoot(): Boot {
  const el = document.getElementById("boot");
  if (!el?.textContent) throw new Error("Missing boot payload");
  const raw: unknown = JSON.parse(el.textContent);
  const text = (key: string) => {
    const v: unknown = typeof raw === "object" && raw !== null ? Reflect.get(raw, key) : undefined;
    if (typeof v !== "string") throw new Error(`Boot payload: ${key} must be a string`);
    return v;
  };
  // The view is checked against the room's view schema when the client is made (connectRoom).
  const view: unknown = typeof raw === "object" && raw !== null ? Reflect.get(raw, "view") : undefined;
  return { roomCode: text("roomCode"), id: text("id"), sig: text("sig"), view };
}

export function mount(render: (boot: Boot) => ReactNode): void {
  const boot = readBoot();
  const root = document.getElementById("app");
  if (!root) throw new Error("Missing #app");
  const client = connectRoom(boot);
  createRoot(root).render(<RoomContext.Provider client={client}>{render(boot)}</RoomContext.Provider>);
}
