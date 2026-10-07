import { mount } from "./boot";
import { setUpApp } from "./install";
import { PhoneScreen } from "./screens/PhoneScreen";

setUpApp();
mount(() => <PhoneScreen />);
