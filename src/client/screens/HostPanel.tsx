import { isOGSCastAvailable } from "@open-game-system/cast-kit-core";
import { CastProvider, useCastViewUrl } from "@open-game-system/cast-kit-react";
import { useMemo } from "react";
import qrcode from "qrcode-generator";
import { RoomContext } from "../../room.context";

export type Hosting = { tvUrl: string; joinUrl: string };

function qrDataUrl(text: string): string {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return qr.createDataURL(6, 2);
}

/**
 * Inside the OGS app: declare the streamed TV page (the OGS app hands it to the TV launcher as the
 * game's view). Casting itself is the OGS app's (its TV tab), so the game shows no cast UI here.
 */
function OgsTvPage({ tvUrl }: { tvUrl: string }) {
  useCastViewUrl(`${tvUrl}&stream=1`);
  return null;
}

/**
 * Keeps declaring this phone's TV page after the lobby (and for a phone that joined another
 * household's room, OGS multiCouch): inside the OGS app only.
 */
export function OwnTvPage({ hosting }: { hosting: Hosting }) {
  const inOgs = useMemo(() => isOGSCastAvailable(), []);
  if (!inOgs) return null;
  return (
    <CastProvider>
      <OgsTvPage tvUrl={hosting.tvUrl} />
    </CastProvider>
  );
}

/**
 * The host phone's lobby extras: room code and QR for the other players, and (outside the OGS app) a
 * link to open the TV page on a laptop. Inside the OGS app, the app casts; this only declares the TV page.
 */
export function HostPanel({ hosting }: { hosting: Hosting }) {
  const code = RoomContext.useSelector((s) => s.public.roomCode);
  const open = RoomContext.useSelector((s) => s.value === "lobby" && s.public.seats.length < 7);
  const inOgs = useMemo(() => isOGSCastAvailable(), []);
  const qr = useMemo(() => qrDataUrl(hosting.joinUrl), [hosting.joinUrl]);
  return (
    <>
      {inOgs && (
        <CastProvider>
          <OgsTvPage tvUrl={hosting.tvUrl} />
        </CastProvider>
      )}
      {(!inOgs || open) && (
        <div className="host-panel">
          {!inOgs && (
            <div className="host-tv">
              <p className="kicker">TV screen</p>
              <p className="host-link">
                Open <a href={hosting.tvUrl}>the TV screen</a> on a laptop or TV browser.
              </p>
            </div>
          )}
          {open && (
            <div className="host-join">
              <img className="host-qr" src={qr} alt={`QR code to join room ${code}`} />
              <div>
                <p className="kicker">Everyone else: scan to join</p>
                <p className="host-code">{code}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
