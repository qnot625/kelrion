import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles/base.css";
import "./styles/shell.css";
import "./styles/views.css";
import "./styles/workforce-lifecycle.css";
import "./styles/control-plane.css";
import "./styles/scheduling.css";
import "./features/customer-intelligence/customer-intelligence.css";
import "./features/forms/forms.css";
import "./features/workflow/workflow.css";
import "./features/approvals/approvals.css";
import "./features/service-desk/service-desk.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode><App /></React.StrictMode>,
);
