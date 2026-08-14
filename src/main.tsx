import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { V3App } from "./v3/App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <V3App />
  </BrowserRouter>
);
