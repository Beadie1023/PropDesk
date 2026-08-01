import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Account, Trade } from '@/types';

type DataState = {
  accounts: Account[];
  trades: Trade[];
  loading: boolean;
  error: string | null;
  refreshAccounts: () => Promise<void>;
  refreshTrades: () => Promise<void>;
  updateAccountBalance: (id: string, balance: number) => Promise<void>;
  addTrade: (trade: Omit<Trade, 'id' | 'created_at'>) => Promise<void>;
  deleteTrade: (id: string) => Promise<void>;
};

const sortAccounts = (a: Account[]) =>
  [...a].sort((x, y) => x.sort_order - y.sort_order);

export const usePropDeskData = (): DataState => {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshAccounts = useCallback(async () => {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .order('sort_order');
    if (error) {
      setError(error.message);
      return;
    }
    setAccounts(sortAccounts((data as Account[]) ?? []));
  }, []);

  const refreshTrades = useCallback(async () => {
    const { data, error } = await supabase
      .from('trades')
      .select('*')
      .order('trade_date', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) {
      setError(error.message);
      return;
    }
    setTrades((data as Trade[]) ?? []);
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      await Promise.all([refreshAccounts(), refreshTrades()]);
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [refreshAccounts, refreshTrades]);

  const updateAccountBalance = useCallback(
    async (id: string, balance: number) => {
      const { error } = await supabase
        .from('accounts')
        .update({ balance })
        .eq('id', id);
      if (error) {
        setError(error.message);
        return;
      }
      setAccounts((prev) =>
        sortAccounts(prev.map((a) => (a.id === id ? { ...a, balance } : a))),
      );
    },
    [],
  );

  const addTrade = useCallback(
    async (trade: Omit<Trade, 'id' | 'created_at'>) => {
      const { error } = await supabase.from('trades').insert(trade);
      if (error) {
        setError(error.message);
        return;
      }
      await refreshTrades();
    },
    [refreshTrades],
  );

  const deleteTrade = useCallback(
    async (id: string) => {
      const { error } = await supabase.from('trades').delete().eq('id', id);
      if (error) {
        setError(error.message);
        return;
      }
      setTrades((prev) => prev.filter((t) => t.id !== id));
    },
    [],
  );

  return {
    accounts,
    trades,
    loading,
    error,
    refreshAccounts,
    refreshTrades,
    updateAccountBalance,
    addTrade,
    deleteTrade,
  };
};
