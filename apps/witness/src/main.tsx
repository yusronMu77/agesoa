import "@agesoa/ui/fonts.css";
import "@agesoa/ui/tokens.css";
import "./styles.css";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { loadConfig } from "./config";

const root = ReactDOM.createRoot(document.getElementById("root")!);
try {
  const config = loadConfig();
  root.render(
    <React.StrictMode>
      <App config={config} />
    </React.StrictMode>,
  );
} catch (error) {
  root.render(<pre role="alert">{error instanceof Error ? error.message : String(error)}</pre>);
}
