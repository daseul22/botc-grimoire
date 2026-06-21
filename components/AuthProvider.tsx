"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { meAction } from "@/app/auth/actions";
import type { Role } from "@/lib/auth-roles";

export type ClientUser = {
  id: number;
  loginId: string;
  nickname: string;
  roles: Role[];
};

type AuthState = {
  user: ClientUser | null;
  loading: boolean;
  isAdmin: boolean;
  isStoryteller: boolean;
  hasRole: (r: Role) => boolean;
  refresh: () => void;
};

const AuthCtx = createContext<AuthState>({
  user: null,
  loading: true,
  isAdmin: false,
  isStoryteller: false,
  hasRole: () => false,
  refresh: () => {},
});

/**
 * 클라이언트 인증 상태. 레이아웃에서 cookies()를 읽지 않으려고(=정적 페이지 보존)
 * 마운트·경로 변경 시 서버 액션(meAction)으로 현재 사용자를 가져온다.
 * 보안은 서버 액션/민감 페이지에서 별도 검증 — 이건 UI 게이팅(보여주기/숨기기)용.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ClientUser | null>(null);
  const [loading, setLoading] = useState(true);
  const pathname = usePathname();
  const reqId = useRef(0);

  const refresh = useCallback(() => {
    const id = ++reqId.current;
    meAction().then((u) => {
      // 경합 시 최신 응답만 반영.
      if (id === reqId.current) {
        setUser(u);
        setLoading(false);
      }
    });
  }, []);

  // 마운트 + 경로 변경(로그인/로그아웃 redirect 포함) 시 갱신.
  useEffect(() => {
    refresh();
  }, [refresh, pathname]);

  const hasRole = useCallback(
    (r: Role) => !!user && (user.roles.includes("admin") || user.roles.includes(r)),
    [user],
  );

  return (
    <AuthCtx.Provider
      value={{
        user,
        loading,
        isAdmin: hasRole("admin"),
        isStoryteller: hasRole("storyteller"),
        hasRole,
        refresh,
      }}
    >
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
