import { Outlet } from "react-router-dom";
import { AssignedChannelsProvider } from "@/contexts/AssignedChannelsContext";
import { TaskAlertProvider } from "@/contexts/TaskAlertContext";
import { LeadNotificationProvider } from "@/contexts/LeadNotificationContext";
import { ChatMessageNotificationProvider } from "@/contexts/ChatMessageNotificationContext";
import { LeadNotificationDisplay } from "@/components/LeadNotificationDisplay";
import { ChatMessageNotificationDisplay } from "@/components/ChatMessageNotificationDisplay";

export default function AuthenticatedAppProviders() {
  return (
    <AssignedChannelsProvider>
      <TaskAlertProvider>
        <LeadNotificationProvider>
          <ChatMessageNotificationProvider>
            <Outlet />
            <LeadNotificationDisplay />
            <ChatMessageNotificationDisplay />
          </ChatMessageNotificationProvider>
        </LeadNotificationProvider>
      </TaskAlertProvider>
    </AssignedChannelsProvider>
  );
}
