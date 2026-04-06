import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setToken } from "../api";
import type { User } from "../types";

type AuthContextValue = {
  user: User | null;
  ready: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const existingToken = localStorage.getItem("token");
    if (!existingToken) {
      setReady(true);
      return;
    }

    setToken(existingToken);
    api<{ user: User }>("/auth/me")
      .then((response) => setUser(response.user))
      .catch(() => {
        setToken(null);
        setUser(null);
      })
      .finally(() => setReady(true));
  }, []);

  const value: AuthContextValue = {
    user,
    ready,
    login(token, nextUser) {
      setToken(token);
      setUser(nextUser);
    },
    logout() {
      setToken(null);
      setUser(null);
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
