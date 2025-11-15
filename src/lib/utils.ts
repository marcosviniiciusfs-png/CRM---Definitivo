import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPhoneNumber(phone: string): string {
  // Remove @s.whatsapp.net, @lid, @g.us e qualquer outro sufixo
  return phone.replace(/@s\.whatsapp\.net|@lid|@g\.us/g, '').trim();
}
