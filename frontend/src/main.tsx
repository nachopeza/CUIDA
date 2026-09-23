import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App.js";
import { AuthProvider } from "./lib/auth.js";
// La tipografía de la interfaz, servida desde la propia aplicación y no desde
// Google: estaba declarada en Tailwind pero no se cargaba, así que cada
// sistema ponía la suya. Va alojada aquí a propósito — pedirle la tipografía a
// Google significa mandarle la IP de cada visitante, y en una aplicación que
// trata datos de salud eso es una cesión que nadie ha autorizado.
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
