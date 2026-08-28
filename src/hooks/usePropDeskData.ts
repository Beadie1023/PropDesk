import { useCallback, useEffect, useState } from 'react';
import type { Account, Trade } from '@/types';
import { genId, loadAccounts, loadTrades, saveAccounts, saveTrades } from '@/lib/storage';
import { recalculateBalance } from '@/lib/trading';

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
  importTrades: (trades: Omit<Trade, 'id'>[], accountId: string) => Promise<void>;
};

const sortAccounts = (a: Account[]) => [...a];

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

        const targetAccount = accounts.find((a) => a.name === trade.account_name);
        if (targetAccount) {
          const newBalance = recalculateBalance(targetAccount, updated);
          const updatedAccounts = accounts.map((a) =>
            a.id === targetAccount.id
              ? { ...a, balance: newBalance, highWaterMark: Math.max(a.highWaterMark, newBalance) }
              : a,
          );
          setAccounts(sortAccounts(updatedAccounts));
          saveAccounts(updatedAccounts);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to save trade');
      }
    },
    [trades, accounts],
  );

  const deleteTrade = useCallback(
    async (id: string) => {
      try {
        const removed = trades.find((t) => t.id === id);
        const updated = trades.filter((t) => t.id !== id);
        setTrades(updated);
        saveTrades(updated);

        const targetAccount = removed && accounts.find((a) => a.name === removed.account_name);
        if (targetAccount) {
          const newBalance = recalculateBalance(targetAccount, updated);
          const updatedAccounts = accounts.map((a) =>
            a.id === targetAccount.id ? { ...a, balance: newBalance } : a,
          );
          setAccounts(sortAccounts(updatedAccounts));
          saveAccounts(updatedAccounts);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to delete trade');
      }
    },
    [trades, accounts],
  );

  /**
   * Bulk-imports trades (e.g. from a CSV parse), persists them to
   * localStorage, then recalculates the target account's balance from the
   * full trade log. Trading days completed and the consistency check are
   * derived live from `trades` elsewhere, so they update automatically once
   * this state changes — no separate recompute step needed for those.
   */
  const importTrades = useCallback(
    async (newTrades: Omit<Trade, 'id'>[], accountId: string) => {
      try {
        const withIds: Trade[] = newTrades.map((t) => ({ ...t, id: genId() }));
        const updatedTrades = [...withIds, ...trades];
        setTrades(updatedTrades);
        saveTrades(updatedTrades);

        const targetAccount = accounts.find((a) => a.id === accountId);
        if (targetAccount) {
          const newBalance = recalculateBalance(targetAccount, updatedTrades);
          const updatedAccounts = accounts.map((a) =>
            a.id === accountId
              ? { ...a, balance: newBalance, highWaterMark: Math.max(a.highWaterMark, newBalance) }
              : a,
          );
          setAccounts(sortAccounts(updatedAccounts));
          saveAccounts(updatedAccounts);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to import trades');
      }
    },
    [trades, accounts],
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
    importTrades,
  };
};
