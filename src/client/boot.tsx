import { createRoot } from "react-dom/client";
import type { ReactNode } from "react";
import { RoomProvider } from "../room.context";
import { BootSchema } from "../room.schemas";
import type { Boot } from "../room.types";

/** Parses the snapshot the Worker injected into the page. */
export function readBoot(): Boot {
  const el = document.getElementById("boot");
  if (!el?.textContent) throw new Error("Missing boot payload");
  return BootSchema.parse(JSON.parse(el.textContent));
}

export function mount(render: (boot: Boot) => ReactNode): void {
  const boot = readBoot();
  const root = document.getElementById("app");
  if (!root) throw new Error("Missing #app");
  createRoot(root).render(
    <RoomProvider
      host={boot.host}
      actorId={boot.roomCode}
      accessToken={boot.accessToken}
      checksum={boot.checksum}
      initialSnapshot={boot.snapshot}
    >
      {render(boot)}
    </RoomProvider>,
  );
}
