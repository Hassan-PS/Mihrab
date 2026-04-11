import { useEffect, type ReactNode } from 'react';
import { InteractionManager, Platform } from 'react-native';
import {
  finishTransaction,
  flushFailedPurchasesCachedAsPendingAndroid,
  purchaseUpdatedListener,
} from 'react-native-iap';
import type { Purchase } from 'react-native-iap';
import { ensureIapReady } from './iapConnection';
import { isTipProductId } from './tipProductIds';

async function finishTipPurchase(purchase: Purchase) {
  await finishTransaction({ purchase, isConsumable: true });
}

/**
 * Keeps the billing connection open and completes tip (consumable) purchases so
 * transactions do not linger across app restarts.
 */
export function TipIapBootstrap({ children }: { children: ReactNode }) {
  useEffect(() => {
    const connect = async () => {
      const ok = await ensureIapReady();
      if (ok && Platform.OS === 'android') {
        await flushFailedPurchasesCachedAsPendingAndroid().catch(() => {});
      }
    };

    // Defer until after first paint / activity readiness — BillingClient often fails
    // if init runs synchronously on the first tick (common on Android Play builds).
    const task = InteractionManager.runAfterInteractions(() => {
      void connect();
    });

    const sub = purchaseUpdatedListener(
      purchase => {
        if (!isTipProductId(purchase.productId)) {
          return;
        }
        void (async () => {
          const ready = await ensureIapReady();
          if (!ready) {
            return;
          }
          await finishTipPurchase(purchase).catch(() => {});
        })();
      },
      // Android: required or `startListening()` failures become unhandled rejections (see eventEmitter.js).
      () => {},
    );

    return () => {
      sub.remove();
      task.cancel();
      // Do not call `endConnection` here: this wrapper stays mounted for the app lifetime.
      // Tearing down billing on unmount breaks Play Billing under React 18 Strict Mode (dev)
      // and races with Settings loading products on first open.
    };
  }, []);

  return children;
}
