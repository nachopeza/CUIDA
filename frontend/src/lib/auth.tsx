import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "./api.js";

export interface Usuario {
  id: string;
  email: string;
  rol: "PERSONA" | "FAMILIAR" | "PROFESIONAL" | "COORDINADOR" | "ORGANIZACION" | "ADMIN" | "SUPERADMIN";
  organizacionId: string | null;
  personaId: string | null;
  profesionalId: string | null;
}

interface AuthState {
  token: string | null;
  usuario: Usuario | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("cuida_token"));
  const [usuario, setUsuario] = useState<Usuario | null>(() => {
    const raw = localStorage.getItem("cuida_usuario");
    return raw ? JSON.parse(raw) : null;
  });

  useEffect(() => {
    if (token) localStorage.setItem("cuida_token", token);
    else localStorage.removeItem("cuida_token");
  }, [token]);

  useEffect(() => {
    if (usuario) localStorage.setItem("cuida_usuario", JSON.stringify(usuario));
    else localStorage.removeItem("cuida_usuario");
  }, [usuario]);

  async function login(email: string, password: string) {
    const data = await api.post<{ token: string; usuario: Usuario }>("/auth/login", { email, password }, null);
    setToken(data.token);
    setUsuario(data.usuario);
  }

  function logout() {
    setToken(null);
    setUsuario(null);
  }

  return <AuthContext.Provider value={{ token, usuario, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
