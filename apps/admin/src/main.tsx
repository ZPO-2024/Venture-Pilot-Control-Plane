import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./styles.css";
import App from "./App";
import Overview from "./pages/Overview";
import Products from "./pages/Products";
import PilotList from "./pages/PilotList";
import PilotWizard from "./pages/PilotWizard";
import PilotDetail from "./pages/PilotDetail";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<Overview />} />
          <Route path="products" element={<Products />} />
          <Route path="pilots" element={<PilotList />} />
          <Route path="pilots/new" element={<PilotWizard />} />
          <Route path="pilots/:id" element={<PilotDetail />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
);
