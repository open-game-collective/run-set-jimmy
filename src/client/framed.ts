/**
 * Another page frames this one: the OGS TV launcher (or any parent page). A framed TV page shows no
 * Full screen button (the launcher owns the screen) and starts its sound itself (the launcher's frame
 * allows autoplay), like the streamed TV.
 */
export function isFramed(win: { self: unknown; top: unknown }): boolean {
  return win.self !== win.top;
}
