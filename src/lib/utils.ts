import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatPhoneNumber(phone: string): string {
  // Remove @s.whatsapp.net, @lid, @g.us e qualquer outro sufixo
  const cleanPhone = phone.replace(/@s\.whatsapp\.net|@lid|@g\.us/g, '').trim();
  
  // Se não for um número válido, retorna como está
  if (!/^\d+$/.test(cleanPhone)) {
    return cleanPhone;
  }
  
  // Formato brasileiro: +55 XX XXXXX-XXXX ou +55 XX XXXX-XXXX
  if (cleanPhone.startsWith('55') && cleanPhone.length >= 12) {
    const countryCode = cleanPhone.slice(0, 2); // 55
    const areaCode = cleanPhone.slice(2, 4); // DDD
    const number = cleanPhone.slice(4);
    
    // Celular (9 dígitos) ou Fixo (8 dígitos)
    if (number.length === 9) {
      // +55 XX XXXXX-XXXX
      return `+${countryCode} ${areaCode} ${number.slice(0, 5)}-${number.slice(5)}`;
    } else if (number.length === 8) {
      // +55 XX XXXX-XXXX
      return `+${countryCode} ${areaCode} ${number.slice(0, 4)}-${number.slice(4)}`;
    }
  }
  
  // Se não corresponder ao formato esperado, retorna com prefixo + apenas
  if (cleanPhone.length >= 10) {
    return `+${cleanPhone}`;
  }
  
  return cleanPhone;
}
