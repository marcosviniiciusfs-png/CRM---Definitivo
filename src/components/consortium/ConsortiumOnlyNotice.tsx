import { Calculator } from "lucide-react";

/** Estado vazio das telas que só existem no modo consórcio. */
export function ConsortiumOnlyNotice() {
  return (
    <div className="mx-auto mt-12 max-w-md rounded-lg border bg-card p-6 text-center">
      <Calculator className="mx-auto h-8 w-8 text-muted-foreground" strokeWidth={1.75} aria-hidden="true" />
      <h1 className="mt-3 text-base font-semibold">Simulador de consórcio</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Esta tela faz parte do modo consórcio. O dono ou um administrador liga o modo em Configurações › Organização.
      </p>
    </div>
  );
}
