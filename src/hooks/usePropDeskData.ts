import { useCallback, useEffect, useState } from 'react';
import type { Account, Trade } from '@/types';
import { genId, loadAccounts, loadTrades, saveAccounts, saveTrades } from '@/lib/storage';

type DataState = {
  accounts: Account[];
  trades: Trade[];
  loading: boolean;
  error: string | null;
  refreshAccounts: () => Promise<void>;
  refreshTrades: () => Promise<void>;
  updateAccountBalance: (id: string, balance: number) => Promise<void>;
  addTrade: (trade: Omit<Trade, 'id'>) => Promise<void>;
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
    try {
      setAccounts(sortAccounts(loadAccounts()));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load accounts');
    }
  }, []);

  const refreshTrades = useCallback(async () => {
    try {
      setTrades(loadTrades());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load trades');
    }
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([refreshAccounts(), refreshTrades()]);
      setLoading(false);
    })();
  }, [refreshAccounts, refreshTrades]);

  const updateAccountBalance = useCallback(
    async (id: string, balance: number) => {
      try {
        const updated = accounts.map((a) =>
          a.id === id ? { ...a, balance } : a,
        );
        setAccounts(sortAccounts(updated));
        saveAccounts(updated);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to update balance');
      }
    },
    [accounts],
  );

  const addTrade = useCallback(
    async (trade: Omit<Trade, 'id'>) => {
      try {
        const newTrade: Trade = { ...trade, id: genId() };
        const updated = [newTrade, ...trades];
        setTrades(updated);
        saveTrades(updated);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save trade');
      }
    },
    [trades],
  );

  const deleteTrade = useCallback(
    async (id: string) => {
      try {
        const updated = trades.filter((t) => t.id !== id);
        setTrades(updated);
        saveTrades(updated);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to delete trade');
      }
    },
    [trades],
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
