import { createRoot } from "react-dom/client";
import { setUpApp } from "./install";
import { StartChooser } from "./screens/StartChooser";

// The installed app opens here (manifest start_url): host, join, rejoin, or be the TV.
setUpApp();
const root = document.getElementById("app");
if (root) createRoot(root).render(<StartChooser />);
