import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/views.css";
import "./styles/workforce-lifecycle.css";
import "./features/customer-intelligence/customer-intelligence.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
