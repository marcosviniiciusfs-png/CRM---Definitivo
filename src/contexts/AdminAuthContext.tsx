/**
 * AdminAuthContext
 *
 * Sistema de autenticação SEPARADO e independente do CRM Auth.
 * O painel admin usa suas próprias credenciais (email + senha admin)
 * armazenadas na tabela admin_credentials — completamente isoladas
 * do Supabase Auth do CRM.
 *
 * O token admin é:
 *  - Armazenado em sessionStorage (morre ao fechar o browser/aba)
 *  - Gerado pela RPC admin_login_system no Postgres
 */

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

const ADMIN_TOKEN_KEY = "kairoz_admin_token";
const ADMIN_EMAIL_KEY = "kairoz_admin_email";

interface AdminAuthContextType {
    adminEmail: string | null;
    adminLoading: boolean;
    isAdminAuthenticated: boolean;
    adminLogin: (email: string, password: string) => Promise<{ error?: string }>;
    adminLogout: () => void;
}

const AdminAuthContext = createContext<AdminAuthContextType | undefined>(undefined);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
    const [adminEmail, setAdminEmail] = useState<string | null>(null);
    const [adminLoading, setAdminLoading] = useState(true);
    const [isAdminAuthenticated, setIsAdminAuthenticated] = useState(false);

    // Restaurar sessão admin ao montar
    useEffect(() => {
        const restoreSession = async () => {
            const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
            const email = sessionStorage.getItem(ADMIN_EMAIL_KEY);

            if (!token || !email) {
                setAdminLoading(false);
                return;
            }

            try {
                // Verificar token com RPC no banco
                const { data: isValid, error } = await supabase.rpc("validate_admin_token", {
                    p_token: token
                });

                if (error || !isValid) {
                    sessionStorage.removeItem(ADMIN_TOKEN_KEY);
                    sessionStorage.removeItem(ADMIN_EMAIL_KEY);
                    setIsAdminAuthenticated(false);
                } else {
                    setAdminEmail(email);
                    setIsAdminAuthenticated(true);
                }
            } catch {
                sessionStorage.removeItem(ADMIN_TOKEN_KEY);
                sessionStorage.removeItem(ADMIN_EMAIL_KEY);
                setIsAdminAuthenticated(false);
            } finally {
                setAdminLoading(false);
            }
        };

        restoreSession();
    }, []);

    const adminLogin = async (email: string, password: string): Promise<{ error?: string }> => {
        try {
            const { data, error } = await supabase.rpc("admin_login_system", {
                p_email: email,
                p_password: password
            });

            if (error) {
                return { error: error.message || "Erro ao conectar ao servidor" };
            }

            const result = data as any;
            if (result?.success === false) {
                return { error: result.error || "Email ou senha incorretos" };
            }

            if (result?.token) {
                sessionStorage.setItem(ADMIN_TOKEN_KEY, result.token);
                sessionStorage.setItem(ADMIN_EMAIL_KEY, result.email);
                setAdminEmail(result.email);
                setIsAdminAuthenticated(true);
                return {};
            }

            return { error: "Resposta inesperada do servidor" };
        } catch (err: any) {
            return { error: err.message || "Erro desconhecido" };
        }
    };

    const adminLogout = () => {
        const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
        if (token) {
            supabase.rpc("admin_logout_system", { p_token: token }).catch(() => { });
        }
        sessionStorage.removeItem(ADMIN_TOKEN_KEY);
        sessionStorage.removeItem(ADMIN_EMAIL_KEY);
        setAdminEmail(null);
        setIsAdminAuthenticated(false);
    };

    return (
        <AdminAuthContext.Provider
            value={{ adminEmail, adminLoading, isAdminAuthenticated, adminLogin, adminLogout }}
        >
            {children}
        </AdminAuthContext.Provider>
    );
}

export function useAdminAuth() {
    const ctx = useContext(AdminAuthContext);
    if (!ctx) throw new Error("useAdminAuth deve ser usado dentro de AdminAuthProvider");
    return ctx;
}

/** Retorna o token admin armazenado na sessionStorage */
export function getAdminToken(): string | null {
    return sessionStorage.getItem(ADMIN_TOKEN_KEY);
}
