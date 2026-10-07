import { createActorKitRouter, createMachineServer } from "actor-kit/worker";
import type { Env } from "./env";
import { roomMachine } from "./room.machine";
import { RoomClientEventSchema, RoomInputPropsSchema, RoomServiceEventSchema } from "./room.schemas";

export const Room = createMachineServer({
  machine: roomMachine,
  schemas: {
    clientEvent: RoomClientEventSchema,
    serviceEvent: RoomServiceEventSchema,
    inputProps: RoomInputPropsSchema,
  },
  options: {
    persisted: true,
  },
});

export type RoomServer = InstanceType<typeof Room>;

export interface WorkerEnv extends Env {
  ASSETS: Fetcher;
  ROOM: DurableObjectNamespace<RoomServer>;
}

export const actorKitRouter = createActorKitRouter<WorkerEnv>(["room"]);
