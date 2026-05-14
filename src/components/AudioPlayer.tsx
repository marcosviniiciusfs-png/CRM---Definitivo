import { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, Download, AlertCircle } from "lucide-react";

interface AudioPlayerProps {
  audioUrl: string;
  mimetype?: string;
  duration?: number;
  className?: string;
  /** Quando true, usa estilo "saída" (fundo escuro teal como a chat-bubble) */
  outgoing?: boolean;
}

const BAR_COUNT = 30;

// Alturas fixas pré-geradas para simular a forma de onda (sem acesso ao buffer real)
const WAVEFORM_HEIGHTS = [
  10, 18, 26, 22, 14, 28, 16, 20, 12, 24,
  20, 16, 28, 10, 22, 18, 14, 26, 12, 20,
  16, 24, 18, 10, 22, 28, 14, 20, 16, 12,
];

const SPEEDS = [1, 1.5, 2] as const;

function formatTime(time: number): string {
  if (!isFinite(time) || time < 0) return "0:00";
  const m = Math.floor(time / 60);
  const s = Math.floor(time % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export const AudioPlayer = ({
  audioUrl,
  mimetype,
  duration,
  className = "",
  outgoing = false,
}: AudioPlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration ?? 0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [speedIndex, setSpeedIndex] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const isWhatsAppEncryptedUrl =
    audioUrl.includes("whatsapp.net") && audioUrl.includes(".enc");

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isWhatsAppEncryptedUrl) {
      setHasError(true);
      setIsLoading(false);
      return;
    }

    const onMeta = () => { setAudioDuration(audio.duration); setIsLoading(false); setHasError(false); };
    const onTime = () => setCurrentTime(audio.currentTime);
    const onEnded = () => { setIsPlaying(false); setCurrentTime(0); };
    const onError = () => { setHasError(true); setIsLoading(false); };
    const onCanPlay = () => { setIsLoading(false); setHasError(false); };

    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    audio.addEventListener("canplay", onCanPlay);

    return () => {
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("canplay", onCanPlay);
    };
  }, [audioUrl, isWhatsAppEncryptedUrl]);

  const togglePlayPause = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio || hasError) return;
    try {
      if (isPlaying) {
        audio.pause();
        setIsPlaying(false);
      } else {
        await audio.play();
        setIsPlaying(true);
      }
    } catch {
      setHasError(true);
      setIsPlaying(false);
    }
  }, [isPlaying, hasError]);

  const handleSeek = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const audio = audioRef.current;
      if (!audio || isLoading || hasError || !audioDuration) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      audio.currentTime = pct * audioDuration;
      setCurrentTime(audio.currentTime);
    },
    [isLoading, hasError, audioDuration]
  );

  const cycleSpeed = useCallback(() => {
    const audio = audioRef.current;
    const next = (speedIndex + 1) % SPEEDS.length;
    setSpeedIndex(next);
    if (audio) audio.playbackRate = SPEEDS[next];
  }, [speedIndex]);

  // Waveform progress
  const progress = audioDuration > 0 ? currentTime / audioDuration : 0;
  const playedBars = Math.floor(progress * BAR_COUNT);

  // === Error state ===
  if (hasError) {
    return (
      <div
        className={`flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/60 text-muted-foreground text-sm ${className}`}
      >
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span className="text-xs leading-tight">
          {isWhatsAppEncryptedUrl
            ? "Áudio anterior à atualização"
            : "Áudio indisponível"}
        </span>
        {!isWhatsAppEncryptedUrl && (
          <a
            href={audioUrl}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
            title="Baixar"
          >
            <Download className="h-4 w-4" />
          </a>
        )}
      </div>
    );
  }

  // === Cores conforme direção ===
  // outgoing  → fundo escuro teal (igual ao chat-bubble do projeto)
  // incoming  → fundo claro muted
  const wrapCls = outgoing
    ? "bg-[hsl(var(--chat-bubble))] text-white"
    : "bg-muted/70 text-foreground";

  const btnCls = outgoing
    ? "bg-white/20 hover:bg-white/30 text-white"
    : "bg-primary/10 hover:bg-primary/20 text-primary";

  const barPlayedColor = outgoing ? "rgba(255,255,255,0.9)" : "hsl(var(--chat-bubble))";
  const barIdleColor = outgoing ? "rgba(255,255,255,0.3)" : "hsl(var(--chat-bubble) / 0.3)";
  const timeColor = outgoing ? "rgba(255,255,255,0.65)" : undefined;
  const speedCls = outgoing
    ? "bg-white/15 text-white/80 hover:bg-white/25"
    : "bg-muted text-muted-foreground hover:bg-muted/80";

  return (
    <div
      className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl min-w-[220px] max-w-[300px] ${wrapCls} ${className}`}
    >
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      {/* Play / Pause */}
      <button
        onClick={togglePlayPause}
        disabled={isLoading || hasError}
        title={isLoading ? "Carregando…" : isPlaying ? "Pausar" : "Reproduzir"}
        className={`
          shrink-0 w-8 h-8 rounded-full flex items-center justify-center
          transition-all duration-150 active:scale-95
          disabled:opacity-40 disabled:cursor-not-allowed
          ${btnCls}
        `}
      >
        {isPlaying ? (
          <Pause className="h-3.5 w-3.5" />
        ) : (
          <Play className="h-3.5 w-3.5 translate-x-px" />
        )}
      </button>

      {/* Waveform */}
      <div
        className={`flex-1 flex items-center gap-[2px] h-7 cursor-pointer select-none ${isLoading ? "opacity-40" : ""}`}
        onClick={handleSeek}
        title="Arraste para buscar"
        role="slider"
        aria-valuemin={0}
        aria-valuemax={audioDuration}
        aria-valuenow={currentTime}
      >
        {WAVEFORM_HEIGHTS.map((h, i) => (
          <span
            key={i}
            style={{
              display: "block",
              width: 3,
              height: h,
              borderRadius: 2,
              flexShrink: 0,
              backgroundColor: i < playedBars ? barPlayedColor : barIdleColor,
              transition: "background-color 0.1s",
              ...(isPlaying && i >= playedBars && i < playedBars + 7
                ? {
                    animation: `waveAnim 0.45s ease-in-out infinite`,
                    animationDelay: `${(i % 5) * 0.07}s`,
                  }
                : {}),
            }}
          />
        ))}
      </div>

      {/* Tempo + velocidade */}
      <div className="flex flex-col items-end gap-0.5 shrink-0">
        <span
          className="text-[10px] tabular-nums leading-none"
          style={timeColor ? { color: timeColor } : undefined}
        >
          {isLoading
            ? "…"
            : `${formatTime(currentTime)} / ${formatTime(audioDuration)}`}
        </span>
        <button
          onClick={cycleSpeed}
          className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full transition-colors ${speedCls}`}
        >
          {SPEEDS[speedIndex]}×
        </button>
      </div>

      {/* CSS keyframe para animação de barra (inserido uma única vez via <style>) */}
      <style>{`
        @keyframes waveAnim {
          0%, 100% { transform: scaleY(1); }
          50%       { transform: scaleY(1.5); }
        }
      `}</style>
    </div>
  );
};
