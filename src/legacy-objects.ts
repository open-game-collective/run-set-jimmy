import { DurableObject } from "cloudflare:workers";

/**
 * The 2024 Remix prototype deployed these Durable Object classes under this Worker's name
 * (migration v1). Cloudflare refuses a version that drops a class with existing objects, and
 * deleting them would erase that prototype's stored rooms, so they stay as empty placeholders.
 * To remove them for good: a delete-class migration (it destroys their storage), with Jon's OK.
 */
export class Remix extends DurableObject {}
export class Session extends DurableObject {}
export class Game extends DurableObject {}
