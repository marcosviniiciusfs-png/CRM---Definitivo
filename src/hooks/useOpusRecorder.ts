import { useState, useRef, useCallback } from 'react';

// Importar OpusMediaRecorder dinamicamente para evitar problemas de SSR
let OpusMediaRecorder: any = null;
let isLibraryLoaded = false;

const loadOpusMediaRecorder = async () => {
  if (isLibraryLoaded) return OpusMediaRecorder;
  
  try {
    // Importar a biblioteca de forma dinâmica
    const module = await import('opus-media-recorder');
    OpusMediaRecorder = module.default;
    
    // Configurar os workers necessários
    const workerOptions = {
      encoderWorkerFactory: () => new Worker(
        new URL('opus-media-recorder/encoderWorker.js', import.meta.url),
        { type: 'module' }
      ),
      OggOpusEncoderWasmPath: new URL(
        'opus-media-recorder/OggOpusEncoder.wasm',
        import.meta.url
      ).href,
      WebMOpusEncoderWasmPath: new URL(
        'opus-media-recorder/WebMOpusEncoder.wasm',
        import.meta.url
      ).href,
    };
    
    OpusMediaRecorder.workerOptions = workerOptions;
    isLibraryLoaded = true;
    
    console.log('✅ OpusMediaRecorder carregado com sucesso');
    return OpusMediaRecorder;
  } catch (error) {
    console.error('❌ Erro ao carregar OpusMediaRecorder:', error);
    throw error;
  }
};

interface UseOpusRecorderReturn {
  isRecording: boolean;
  recordingTime: number;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  audioBlob: Blob | null;
}

export const useOpusRecorder = (): UseOpusRecorderReturn => {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  
  const mediaRecorderRef = useRef<any>(null);
  const recordingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startRecording = useCallback(async () => {
    try {
      // Carregar a biblioteca se ainda não foi carregada
      const Recorder = await loadOpusMediaRecorder();
      
      // Solicitar acesso ao microfone
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      
      streamRef.current = stream;

      // Configurar MediaRecorder com OGG/OPUS e alta qualidade
      const options = {
        mimeType: 'audio/ogg; codecs=opus',
        audioBitsPerSample: 16,
        audioBitsPerSecond: 64000, // 64kbps para qualidade de voz
      };

      console.log('🎙️ Iniciando gravação OGG/OPUS com 64kbps');
      
      const mediaRecorder = new Recorder(stream, options);
      mediaRecorderRef.current = mediaRecorder;

      const audioChunks: Blob[] = [];

      mediaRecorder.ondataavailable = (event: BlobEvent) => {
        console.log('📦 Chunk de áudio recebido:', event.data.size, 'bytes');
        audioChunks.push(event.data);
      };

      mediaRecorder.onstop = () => {
        console.log('⏹️ Gravação parada. Total de chunks:', audioChunks.length);
        
        // Criar blob final com tipo correto
        const finalBlob = new Blob(audioChunks, { type: 'audio/ogg; codecs=opus' });
        
        console.log('✅ Áudio OGG/OPUS criado:', {
          size: finalBlob.size,
          type: finalBlob.type,
          duration: recordingTime
        });
        
        setAudioBlob(finalBlob);
        
        // Parar todas as tracks do stream
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
      };

      mediaRecorder.onerror = (error: any) => {
        console.error('❌ Erro no MediaRecorder:', error);
        setIsRecording(false);
        if (recordingIntervalRef.current) {
          clearInterval(recordingIntervalRef.current);
          recordingIntervalRef.current = null;
        }
      };

      // Iniciar gravação
      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);

      // Timer da gravação
      recordingIntervalRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);

    } catch (error) {
      console.error('❌ Erro ao iniciar gravação:', error);
      setIsRecording(false);
      throw error;
    }
  }, [recordingTime]);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      console.log('🛑 Parando gravação...');
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current);
        recordingIntervalRef.current = null;
      }
    }
  }, [isRecording]);

  return {
    isRecording,
    recordingTime,
    startRecording,
    stopRecording,
    audioBlob,
  };
};
