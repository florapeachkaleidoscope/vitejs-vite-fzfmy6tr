import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Kaleidoprint from "./Kaleidoprint.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Kaleidoprint />
  </StrictMode>
);
