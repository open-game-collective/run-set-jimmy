import { DurableObject } from "cloudflare:workers";

/**
 * Durable Object classes earlier versions deployed under this Worker's name. Cloudflare refuses a
 * version that drops a class with existing objects, and deleting one erases its storage, so they
 * stay as empty placeholders. To remove one for good: a delete-class migration, with Jon's OK.
 *
 * - Remix, Session, Game: the 2024 Remix prototype (migration v1).
 * - Room: the actor-kit v1 rooms (migration v2), replaced by RoomActor (migration v3). Its rooms
 *   are no longer reachable.
 */
export class Remix extends DurableObject {}
export class Session extends DurableObject {}
export class Game extends DurableObject {}
export class Room extends DurableObject {}
