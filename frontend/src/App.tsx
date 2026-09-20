import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./lib/auth.js";
import { Layout } from "./components/Layout.js";
import { LoginPage } from "./pages/LoginPage.js";
import { PersonaPage } from "./pages/PersonaPage.js";
import { FamiliaPage } from "./pages/FamiliaPage.js";
import { ProfesionalPage } from "./pages/ProfesionalPage.js";
import { CoordinadorPage } from "./pages/CoordinadorPage.js";

function RoleHome() {
  const { usuario } = useAuth();
  switch (usuario?.rol) {
    case "PERSONA":
      return <PersonaPage />;
    case "FAMILIAR":
      return <FamiliaPage />;
    case "PROFESIONAL":
      return <ProfesionalPage />;
    case "COORDINADOR":
    case "ORGANIZACION":
    case "ADMIN":
    case "SUPERADMIN":
      return <CoordinadorPage />;
    default:
      return null;
  }
}

export default function App() {
  const { token } = useAuth();

  if (!token) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<RoleHome />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
