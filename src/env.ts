export interface Env {
  /** Signs caller ids (src/identity.ts). */
  ACTOR_KIT_SECRET: string;
  /** OGS's public game-token keys (the API's /.well-known/jwks.json); default: production OGS. */
  OGS_JWKS_URL?: string;
}
