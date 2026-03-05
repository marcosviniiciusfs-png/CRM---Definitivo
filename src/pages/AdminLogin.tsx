import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import { Shield, Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import kairozLogo from "@/assets/kairoz-logo-full-new.png";

export default function AdminLogin() {
    const navigate = useNavigate();
    const { adminLogin, isAdminAuthenticated } = useAdminAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);

    // Redirecionar se já autenticado
    if (isAdminAuthenticated) {
        navigate("/admin", { replace: true });
        return null;
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!email || !password) {
            toast.error("Preencha email e senha");
            return;
        }

        setLoading(true);
        const result = await adminLogin(email, password);
        setLoading(false);

        if (result.error) {
            toast.error(result.error);
        } else {
            toast.success("Acesso admin concedido");
            navigate("/admin", { replace: true });
        }
    };

    return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
            {/* Background pattern */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/5 rounded-full blur-3xl" />
                <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-600/5 rounded-full blur-3xl" />
            </div>

            <div className="relative w-full max-w-md">
                {/* Card */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 shadow-2xl">
                    {/* Header */}
                    <div className="flex flex-col items-center gap-4 mb-8">
                        <img src={kairozLogo} alt="Kairoz" className="h-8 brightness-0 invert" />
                        <div className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-full px-4 py-1.5">
                            <Shield className="w-4 h-4 text-blue-400" />
                            <span className="text-sm font-medium text-gray-300">Painel Administrativo</span>
                        </div>
                        <div className="text-center">
                            <h1 className="text-xl font-bold text-white">Acesso Restrito</h1>
                            <p className="text-sm text-gray-500 mt-1">
                                Use as credenciais de administrador para continuar
                            </p>
                        </div>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-400" htmlFor="admin-email">
                                Email do Administrador
                            </label>
                            <input
                                id="admin-email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="admin@exemplo.com"
                                className="w-full bg-gray-800 border border-gray-700 text-white placeholder-gray-600 rounded-lg px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                required
                                autoComplete="email"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <label className="text-sm font-medium text-gray-400" htmlFor="admin-password">
                                Senha do Administrador
                            </label>
                            <div className="relative">
                                <input
                                    id="admin-password"
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Senha exclusiva do painel admin"
                                    className="w-full bg-gray-800 border border-gray-700 text-white placeholder-gray-600 rounded-lg px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                                    required
                                    autoComplete="current-password"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                                >
                                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg px-4 py-3 text-sm transition-all flex items-center justify-center gap-2 mt-2"
                        >
                            {loading ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Verificando...
                                </>
                            ) : (
                                <>
                                    <Shield className="w-4 h-4" />
                                    Entrar no Painel Admin
                                </>
                            )}
                        </button>
                    </form>

                    {/* Footer note */}
                    <p className="text-xs text-gray-600 text-center mt-6 leading-relaxed">
                        Este acesso é separado do login do CRM. Use somente as credenciais
                        fornecidas pelo administrador do sistema.
                    </p>
                </div>

                {/* Back link */}
                <div className="text-center mt-4">
                    <button
                        onClick={() => navigate("/auth")}
                        className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
                    >
                        ← Voltar para o CRM
                    </button>
                </div>
            </div>
        </div>
    );
}
