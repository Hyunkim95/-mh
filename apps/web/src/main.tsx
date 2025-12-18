import React from "react";
import ReactDOM from "react-dom/client";
import "./App.css";
import "@solana/wallet-adapter-react-ui/styles.css";
import "@trpc-template/client/styles/public.css";
import { Root, AppRouter } from "@trpc-template/client";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root>
      <AppRouter />
    </Root>
  </React.StrictMode>
);
