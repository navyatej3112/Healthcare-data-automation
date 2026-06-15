// Verification-only entry point. Mounts the REAL app/page.tsx component so a
// headless browser can exercise it, bypassing Next's (locally wedged) dev server.
// This file is not part of the Next build.
import { createRoot } from "react-dom/client";
import Home from "../app/page";

createRoot(document.getElementById("root")!).render(<Home />);
