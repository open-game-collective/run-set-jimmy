import { isOGSCastAvailable } from "@open-game-system/cast-kit-core";
import { getOgsSessionSource, onOgsPause } from "@open-game-system/profile-kit";
import { createRoot } from "react-dom/client";
import { mount } from "./boot";
import { setUpApp } from "./install";
import { joinedRoomUrl } from "./ogs-claim";
import { StartChooser } from "./screens/StartChooser";
import { TvScreen } from "./screens/TvScreen";
import { captureStream, resumeOnGesture, setSoundPaused, startSound } from "./sound";

setUpApp();
// Listen for the OGS launcher from the first moment (it posts ogs:start as soon as the frame loads).
getOgsSessionSource();
// The launcher parks this TV page (Home, or another game) without unloading it: go silent.
onOgsPause(setSoundPaused);

const params = new URLSearchParams(location.search);
const streamed = params.has("stream");

if (isOGSCastAvailable() && !streamed) {
  // Inside the OGS app this device is a phone, not the TV: host from here (OGS shows the TV page).
  location.replace(joinedRoomUrl(location.href));
} else if (matchMedia("(pointer: coarse)").matches && !params.has("as") && !streamed) {
  // A phone or tablet browser is a controller, not the TV (unless asked to be one with ?as=tv).
  const root = document.getElementById("app");
  if (root) createRoot(root).render(<StartChooser />);
} else {
  // The TV starts its sound by itself (the launcher's frame and the stream allow autoplay); a
  // laptop browser that blocks it starts on the first click.
  startSound();
  resumeOnGesture();
  mount((boot) => <TvScreen joinUrl={`${location.origin}/join/${boot.roomCode}`} />);
}

// The gameplay recorder (e2e/record-game.ts) opens the TV with ?record to capture its sound.
if (params.has("record")) Reflect.set(window, "__tvTap", captureStream);
