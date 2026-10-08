import { useState } from 'react';
import { Check, KeyRound, Loader2 } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import { supabase } from './supabase';

export function ProTestAccessButton() {
  const { user, setIsPro } = useAuth();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const grantAccess = async () => {
    if (!user) {
      setError('Connectez-vous pour autoriser ce compte de test.');
      return;
    }

    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const { data, error: rpcError } = await supabase.rpc('grant_pro_test_access');
      if (rpcError) throw rpcError;
      if (data !== true) throw new Error('Supabase n’a pas confirmé l’autorisation du compte.');

      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) throw refreshError;

      await setIsPro(true);
      setMessage('Accès Pro de test autorisé et is_pro enregistré dans Supabase.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Impossible d’autoriser le compte de test.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        disabled={busy || !user}
        onClick={() => void grantAccess()}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-[11px] font-bold text-indigo-800 transition hover:bg-indigo-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
        Autoriser et activer Pro pour ce compte de test
      </button>
      {message && (
        <p role="status" className="flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
          <Check className="h-3 w-3 shrink-0" />
          {message}
        </p>
      )}
      {error && <p role="alert" className="text-[10px] font-semibold text-red-700">{error}</p>}
    </div>
  );
}
