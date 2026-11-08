import { HomeScreen } from "../src/home-screen";
import { deviceLocale } from "../src/locale";

// TODO(M10-2): route "start" to discovery once the customer screens are ported.
function start() {}

export default function Index() {
  return <HomeScreen locale={deviceLocale()} onStart={start} />;
}
