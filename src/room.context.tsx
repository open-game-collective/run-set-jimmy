import { createActorKitContext } from "actor-kit/react";
import type { roomMachine } from "./room.machine";

export const RoomContext = createActorKitContext<typeof roomMachine>("room");
export const RoomProvider = RoomContext.Provider;
