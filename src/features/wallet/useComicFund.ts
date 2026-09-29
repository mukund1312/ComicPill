import { useCallback, useMemo, useState } from 'react';
import {
  getWalletConfig, setWalletConfig, getWalletSnapshot, listLedger, addFunds,
  listPiggyBanks, createPiggyBank, contributeToPiggyBank, cancelPiggyBank,
  settlePiggyBankPurchase, returnLeftoverToWallet, moveLeftoverToPiggyBank,
  checkPiggyBankReadiness, getBestBuyForEdition, seedPricesForEdition,
  listCartItems, addToCart, removeFromCart, runCartOptimizer, getFundVerdict,
} from '../../lib/db/queries/wallet';
import { autoAllocate } from '../../lib/engines/fund/piggybank';
import type { WalletConfig } from '../../lib/types/domain';

export function useComicFund() {
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const now = useMemo(() => new Date(), [tick]);

  const config = useMemo(() => getWalletConfig(), [tick]);
  const snapshot = useMemo(() => getWalletSnapshot(now), [tick]);
  const ledger = useMemo(() => listLedger(), [tick]);
  const piggyBanks = useMemo(() => listPiggyBanks(), [tick]);
  const cart = useMemo(() => listCartItems(), [tick]);
  const cartPlan = useMemo(() => runCartOptimizer(now), [tick]);

  const updateConfig = useCallback((patch: Partial<WalletConfig>) => { setWalletConfig(patch); refresh(); }, [refresh]);
  const topUp = useCallback((amountPaise: number, note?: string) => { addFunds(amountPaise, note); refresh(); }, [refresh]);

  const startPiggyBank = useCallback((workId: string, editionId: string | null, name: string, targetPaise: number) => {
    const bank = createPiggyBank(workId, editionId, name, targetPaise);
    if (editionId) seedPricesForEdition(editionId);
    refresh();
    return bank;
  }, [refresh]);
  const contribute = useCallback((piggyBankId: string, amountPaise: number) => { contributeToPiggyBank(piggyBankId, amountPaise); refresh(); }, [refresh]);
  const cancel = useCallback((piggyBankId: string) => { cancelPiggyBank(piggyBankId); refresh(); }, [refresh]);
  const allocateLumpSum = useCallback((lumpSumPaise: number) => {
    const allocations = autoAllocate(lumpSumPaise, piggyBanks);
    allocations.forEach((a) => contributeToPiggyBank(a.piggyBankId, a.amountPaise));
    refresh();
    return allocations;
  }, [piggyBanks, refresh]);
  const settle = useCallback((piggyBankId: string, actualPricePaise: number) => {
    const { leftoverPaise } = settlePiggyBankPurchase(piggyBankId, actualPricePaise);
    refresh();
    return leftoverPaise;
  }, [refresh]);
  const settleLeftoverToWallet = useCallback((piggyBankId: string, leftoverPaise: number) => { returnLeftoverToWallet(piggyBankId, leftoverPaise); refresh(); }, [refresh]);
  const settleLeftoverToPiggyBank = useCallback((fromId: string, toId: string, leftoverPaise: number) => { moveLeftoverToPiggyBank(fromId, toId, leftoverPaise); refresh(); }, [refresh]);
  const readiness = useCallback((piggyBankId: string) => checkPiggyBankReadiness(piggyBankId), []);

  const bestBuyFor = useCallback((editionId: string) => { seedPricesForEdition(editionId); return getBestBuyForEdition(editionId); }, []);
  const verdictFor = useCallback((workId: string) => getFundVerdict(workId, now), [now]);

  const addItemToCart = useCallback((workId: string, editionId: string) => { addToCart(workId, editionId); refresh(); }, [refresh]);
  const removeItemFromCart = useCallback((cartItemId: string) => { removeFromCart(cartItemId); refresh(); }, [refresh]);

  return {
    config, updateConfig, snapshot, ledger, topUp,
    piggyBanks, startPiggyBank, contribute, cancel, allocateLumpSum, settle,
    settleLeftoverToWallet, settleLeftoverToPiggyBank, readiness,
    bestBuyFor, verdictFor,
    cart, cartPlan, addItemToCart, removeItemFromCart,
    refresh,
  };
}
