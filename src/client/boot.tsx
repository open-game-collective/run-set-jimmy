import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";
import { connectRoom, RoomContext } from "../room.context";
import { BootSchema } from "../room.schemas";
import type { Boot } from "../room.types";

/** Parses the boot payload the Worker injected into the page. */
export function readBoot(): Boot {
  const el = document.getElementById("boot");
  if (!el?.textContent) throw new Error("Missing boot payload");
  return BootSchema.parse(JSON.parse(el.textContent));
}

export function mount(render: (boot: Boot) => ReactNode): void {
  const boot = readBoot();
  const root = document.getElementById("app");
  if (!root) throw new Error("Missing #app");
  const client = connectRoom(boot);
  createRoot(root).render(<RoomContext.Provider client={client}>{render(boot)}</RoomContext.Provider>);
}
