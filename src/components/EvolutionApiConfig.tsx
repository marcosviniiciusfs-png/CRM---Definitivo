import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, Save, CheckCircle, AlertCircle } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const EvolutionApiConfig = () => {
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('app_config')
        .select('config_key, config_value')
        .in('config_key', ['EVOLUTION_API_URL', 'EVOLUTION_API_KEY']);

      if (error) throw error;

      data?.forEach(item => {
        if (item.config_key === 'EVOLUTION_API_URL') setApiUrl(item.config_value || '');
        if (item.config_key === 'EVOLUTION_API_KEY') setApiKey(item.config_value || '');
      });
    } catch (error) {
      console.error('Error loading config:', error);
      toast({
        title: "Erro ao carregar configurações",
        description: "Não foi possível carregar as configurações da Evolution API.",
        variant: "destructive",
      });
    } finally {
      setLoadingData(false);
    }
  };

  const handleSave = async () => {
    if (!apiUrl.trim() || !apiKey.trim()) {
      toast({
        title: "Campos obrigatórios",
        description: "Por favor, preencha a URL e a Chave da API.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      // Update URL
      const { error: urlError } = await supabase
        .from('app_config')
        .update({ config_value: apiUrl.trim() })
        .eq('config_key', 'EVOLUTION_API_URL');

      if (urlError) throw urlError;

      // Update API Key
      const { error: keyError } = await supabase
        .from('app_config')
        .update({ config_value: apiKey.trim() })
        .eq('config_key', 'EVOLUTION_API_KEY');

      if (keyError) throw keyError;

      toast({
        title: "Configurações salvas",
        description: "As credenciais da Evolution API foram atualizadas com sucesso.",
      });
    } catch (error) {
      console.error('Error saving config:', error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar as configurações. Tente novamente.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const isConfigured = apiUrl && apiKey;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-5 w-5 text-primary" />
          Configuração da Evolution API
          {!loadingData && (
            isConfigured ? (
              <CheckCircle className="h-4 w-4 text-green-500 ml-auto" />
            ) : (
              <AlertCircle className="h-4 w-4 text-yellow-500 ml-auto" />
            )
          )}
        </CardTitle>
        <CardDescription>
          Configure as credenciais para integração com a Evolution API do WhatsApp
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {loadingData ? (
          <p className="text-sm text-muted-foreground">Carregando configurações...</p>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="evolution-url">URL da Evolution API</Label>
              <Input
                id="evolution-url"
                type="url"
                placeholder="https://evolution01.kairozspace.com.br"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                Exemplo: https://evolution01.kairozspace.com.br
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="evolution-key">Chave da API</Label>
              <Input
                id="evolution-key"
                type="password"
                placeholder="Sua chave da Evolution API"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                A chave de autenticação fornecida pela Evolution API
              </p>
            </div>

            {!isConfigured && (
              <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950 p-3">
                <p className="text-sm text-yellow-800 dark:text-yellow-200">
                  ⚠️ As credenciais da Evolution API não estão configuradas. O sistema de WhatsApp não funcionará até que você preencha esses campos.
                </p>
              </div>
            )}

            <Button onClick={handleSave} disabled={loading} className="w-full sm:w-auto">
              <Save className="h-4 w-4 mr-2" />
              {loading ? "Salvando..." : "Salvar Configurações"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default EvolutionApiConfig;
