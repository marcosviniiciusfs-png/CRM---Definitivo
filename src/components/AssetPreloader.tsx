import { useEffect } from 'react';

// Import críticos para garantir que estejam no bundle
import kairozLogo from '@/assets/kairoz-logo-full.png';
import loadingGif from '@/assets/loading-hourglass.gif';
import saleConfirmationGif from '@/assets/sale-confirmation-icon.gif';

const criticalImages = [kairozLogo, loadingGif, saleConfirmationGif];
const criticalAudio = ['/button-click.mp3', '/notification.mp3'];

export function AssetPreloader() {
  useEffect(() => {
    // Pré-carregar imagens críticas
    criticalImages.forEach(src => {
      const img = new Image();
      img.src = src;
    });

    // Pré-carregar áudio
    criticalAudio.forEach(src => {
      const audio = new Audio();
      audio.preload = 'auto';
      audio.src = src;
    });

    // NOVO: Pré-aquecer edge functions para reduzir cold start
    warmEdgeFunctions();
  }, []);

  return null;
}

// Função para pré-aquecer edge functions em background
async function warmEdgeFunctions() {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) return;

  // Aquecer edge functions mais usadas com HEAD request (não bloqueia, apenas aquece container)
  const edgeFunctionsToWarm = [
    'check-subscription',
    'fetch-presence-status',
  ];

  // Executar em background após 1 segundo para não competir com carregamento inicial
  setTimeout(() => {
    edgeFunctionsToWarm.forEach(fnName => {
      fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
        method: 'OPTIONS', // OPTIONS é leve e aquece o container
        headers: { 'Content-Type': 'application/json' }
      }).catch(() => {
        // Ignorar erros silenciosamente - é apenas warming
      });
    });
  }, 1500);
}

// Hook para pré-carregar assets sob demanda
export function usePreloadAssets(assets: string[]) {
  useEffect(() => {
    assets.forEach(src => {
      if (src.match(/\.(mp3|wav|ogg)$/i)) {
        const audio = new Audio();
        audio.preload = 'auto';
        audio.src = src;
      } else {
        const img = new Image();
        img.src = src;
      }
    });
  }, [assets]);
}
