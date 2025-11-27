import { useState, useRef, useCallback } from 'react';

interface OpusRecorderConfig {
  onDataAvailable: (blob: Blob) => void;
  onError: (error: Error) => void;
}

export const useOpusRecorder = ({ onDataAvailable, onError }: OpusRecorderConfig) => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  
  const mediaRecorderRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const loadOpusRecorder = useCallback(async () => {
    try {
      setIsLoading(true);
      // Importar dinamicamente opus-media-recorder
      const { default: OpusMediaRecorder } = await import('opus-media-recorder');
      
      // Carregar workers e wasm
      const workerOptions = {
        OggOpusEncoderWasmPath: 'https://cdn.jsdelivr.net/npm/opus-media-recorder@latest/OggOpusEncoder.wasm',
        WebMOpusEncoderWasmPath: 'https://cdn.jsdelivr.net/npm/opus-media-recorder@latest/WebMOpusEncoder.wasm'
      };

      return { OpusMediaRecorder, workerOptions };
    } catch (error) {
      console.error('❌ Erro ao carregar opus-media-recorder:', error);
      throw new Error('Não foi possível carregar o gravador de áudio OPUS');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      console.log('🎙️ Iniciando gravação com OPUS...');
      
      // Solicitar permissão do microfone
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 48000, // OPUS trabalha melhor com 48kHz
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });

      streamRef.current = stream;
      chunksRef.current = [];

      // Carregar OpusMediaRecorder
      const { OpusMediaRecorder, workerOptions } = await loadOpusRecorder();

      // Configurar MediaRecorder com OPUS
      const options = {
        mimeType: 'audio/ogg; codecs=opus',
        audioBitsPerSecond: 64000, // 64kbps para qualidade de voz
      };

      const recorder = new OpusMediaRecorder(stream, options, workerOptions);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          console.log('📦 Chunk de áudio recebido:', event.data.size, 'bytes, tipo:', event.data.type);
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        console.log('🛑 Gravação parada. Total de chunks:', chunksRef.current.length);
        
        if (chunksRef.current.length > 0) {
          // Criar blob final com tipo correto
          const finalBlob = new Blob(chunksRef.current, { type: 'audio/ogg; codecs=opus' });
          
          console.log('✅ Áudio OGG/OPUS criado:', {
            size: finalBlob.size,
            type: finalBlob.type,
            duration: recordingTime
          });

          onDataAvailable(finalBlob);
        }

        // Limpar stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach(track => track.stop());
          streamRef.current = null;
        }

        chunksRef.current = [];
      };

      recorder.onerror = (event: any) => {
        console.error('❌ Erro no MediaRecorder:', event);
        onError(new Error('Erro ao gravar áudio'));
      };

      // Iniciar gravação
      recorder.start(100); // Coletar dados a cada 100ms
      setIsRecording(true);
      setRecordingTime(0);

      // Iniciar timer
      intervalRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);

      console.log('✅ Gravação OPUS iniciada com sucesso');

    } catch (error) {
      console.error('❌ Erro ao iniciar gravação:', error);
      setIsRecording(false);
      onError(error instanceof Error ? error : new Error('Erro desconhecido ao gravar'));
    }
  }, [loadOpusRecorder, onDataAvailable, onError, recordingTime]);

  const stopRecording = useCallback(() => {
    console.log('🛑 Parando gravação OPUS...');
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    if (mediaRecorderRef.current && isRecording) {
      try {
        mediaRecorderRef.current.stop();
      } catch (error) {
        console.error('❌ Erro ao parar gravação:', error);
      }
    }

    setIsRecording(false);
  }, [isRecording]);

  const cleanup = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
    if (mediaRecorderRef.current && isRecording) {
      try {
        mediaRecorderRef.current.stop();
      } catch (error) {
        console.error('Erro ao limpar gravador:', error);
      }
    }
  }, [isRecording]);

  return {
    isRecording,
    recordingTime,
    isLoading,
    startRecording,
    stopRecording,
    cleanup,
  };
};
