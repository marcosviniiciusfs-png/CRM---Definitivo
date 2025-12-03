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
  }, []);

  return null;
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
