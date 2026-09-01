import { Database, RefreshCw } from 'lucide-react';

export function MigrationMaintenance() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 text-white">
      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center text-center">
        <div className="mb-8 rounded-2xl border border-red-500/20 bg-red-500/10 p-5">
          <Database className="h-10 w-10 text-red-400" aria-hidden="true" />
        </div>
        <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-red-400">
          Atualização programada
        </p>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          O Kairoz CRM está em manutenção
        </h1>
        <p className="mt-5 text-base leading-7 text-slate-300">
          Estamos migrando nossa infraestrutura com segurança. O acesso será
          restabelecido assim que a validação terminar.
        </p>
        <div className="mt-8 flex items-center gap-2 text-sm text-slate-400">
          <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
          Você poderá atualizar esta página em alguns minutos.
        </div>
      </div>
    </main>
  );
}
