import { useState } from "react";
import { SalesOverview, type OverviewPeriod, type SalesOverviewData } from "@/components/dashboard/SalesOverview";
import { useSegmentTerms } from "@/hooks/useOrganizationSegment";

// Dados fictícios só para ver o layout sem login (rota /demo-dashboard, apenas em DEV).
const SAMPLE: SalesOverviewData = {
  revenue: 186400,
  sales: 24,
  leads: 312,
  attended: 241,
  meetingsRealized: 71,
  noShow: 21,
  proposals: 38,
  today: { leads: 14, appointments: 9, realized: 5 },
  monthlyLeads: [
    { label: "mai", value: 198 },
    { label: "jun", value: 224 },
    { label: "jul", value: 251 },
    { label: "ago", value: 236 },
    { label: "set", value: 277 },
    { label: "out", value: 290 },
    { label: "nov", value: 312 },
  ],
  sources: [
    { name: "Facebook Leads", value: 142 },
    { name: "WhatsApp", value: 71 },
    { name: "Google Ads", value: 48 },
    { name: "Indicação", value: 29 },
    { name: "Site", value: 15 },
    { name: "Instagram", value: 7 },
  ],
  team: [
    { id: "carla", name: "Carla Mendes", sales: 9, revenue: 71200 },
    { id: "bruno", name: "Bruno Alves", sales: 7, revenue: 54800 },
    { id: "julia", name: "Júlia Rocha", sales: 5, revenue: 36900 },
    { id: "rafael", name: "Rafael Lima", sales: 3, revenue: 23500 },
  ],
};

export default function DemoDashboard() {
  const [period, setPeriod] = useState<OverviewPeriod>("month");
  const terms = useSegmentTerms();
  return <SalesOverview data={SAMPLE} period={period} onPeriodChange={setPeriod} isSample terms={terms} />;
}
