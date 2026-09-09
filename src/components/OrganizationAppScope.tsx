import { Outlet } from "react-router-dom";
import { OrganizationProvider } from "@/contexts/OrganizationContext";

export default function OrganizationAppScope() {
  return (
    <OrganizationProvider>
      <Outlet />
    </OrganizationProvider>
  );
}
