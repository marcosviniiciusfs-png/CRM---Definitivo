import { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

interface AudioPlayerProps {
  audioUrl: string;
  mimetype?: string;
  duration?: number;
  className?: string;
}

export const AudioPlayer = ({ audioUrl, mimetype, duration, className }: AudioPlayerProps) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration || 0);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    console.log('🎵 AudioPlayer - Iniciando carregamento:', audioUrl);

    const handleLoadedMetadata = () => {
      console.log('✅ AudioPlayer - Metadados carregados, duração:', audio.duration);
      setAudioDuration(audio.duration);
      setIsLoading(false);
      setHasError(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    const handleError = (e: Event) => {
      console.error('❌ AudioPlayer - Erro ao carregar áudio:', e);
      console.error('❌ AudioPlayer - URL:', audioUrl);
      console.error('❌ AudioPlayer - Error code:', audio.error?.code);
      console.error('❌ AudioPlayer - Error message:', audio.error?.message);
      setHasError(true);
      setIsLoading(false);
    };

    const handleCanPlay = () => {
      console.log('✅ AudioPlayer - Pronto para reproduzir');
      setIsLoading(false);
      setHasError(false);
    };

    audio.addEventListener("loadedmetadata", handleLoadedMetadata);
    audio.addEventListener("timeupdate", handleTimeUpdate);
    audio.addEventListener("ended", handleEnded);
    audio.addEventListener("error", handleError);
    audio.addEventListener("canplay", handleCanPlay);

    return () => {
      audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
      audio.removeEventListener("timeupdate", handleTimeUpdate);
      audio.removeEventListener("ended", handleEnded);
      audio.removeEventListener("error", handleError);
      audio.removeEventListener("canplay", handleCanPlay);
    };
  }, [audioUrl]);

  const togglePlayPause = async () => {
    const audio = audioRef.current;
    if (!audio || hasError) {
      console.log('⚠️ AudioPlayer - Não pode reproduzir:', { hasAudio: !!audio, hasError });
      return;
    }

    try {
      if (isPlaying) {
        console.log('⏸️ AudioPlayer - Pausando');
        audio.pause();
        setIsPlaying(false);
      } else {
        console.log('▶️ AudioPlayer - Reproduzindo');
        await audio.play();
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('❌ AudioPlayer - Erro ao reproduzir:', error);
      setHasError(true);
      setIsPlaying(false);
    }
  };

  const handleSliderChange = (value: number[]) => {
    const audio = audioRef.current;
    if (!audio || isLoading || hasError) return;

    const newTime = value[0];
    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const formatTime = (time: number) => {
    if (!isFinite(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  if (hasError) {
    return (
      <div className={`flex items-center gap-3 p-3 bg-destructive/10 rounded-lg ${className}`}>
        <span className="text-sm text-destructive">Erro ao carregar áudio</span>
        <a 
          href={audioUrl} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-xs text-primary underline ml-2"
        >
          Tentar abrir diretamente
        </a>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-3 p-3 bg-muted/50 rounded-lg min-w-[280px] ${className}`}>
      <audio 
        ref={audioRef} 
        src={audioUrl}
        preload="metadata"
      />

      <Button
        size="icon"
        variant="ghost"
        onClick={togglePlayPause}
        disabled={isLoading || hasError}
        className="shrink-0 h-8 w-8"
        title={isLoading ? "Carregando..." : "Reproduzir/Pausar"}
      >
        {isPlaying ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )}
      </Button>

      <Volume2 className="h-4 w-4 text-muted-foreground shrink-0" />

      <div className="flex-1 flex items-center gap-2">
        <Slider
          value={[currentTime]}
          max={audioDuration || 100}
          step={0.1}
          onValueChange={handleSliderChange}
          disabled={isLoading || hasError}
          className="flex-1"
        />
      </div>

      <span className="text-xs text-muted-foreground shrink-0 min-w-[45px] text-right">
        {isLoading ? "..." : `${formatTime(currentTime)} / ${formatTime(audioDuration)}`}
      </span>
    </div>
  );
};
