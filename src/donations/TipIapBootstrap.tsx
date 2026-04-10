import { useEffect, useRef, type ReactNode } from 'react';
import { Platform } from 'react-native';
import {
  endConnection,
  finishTransaction,
  flushFailedPurchasesCachedAsPendingAndroid,
  purchaseUpdatedListener,
} from 'react-native-iap';
import type { Purchase } from 'react-native-iap';
import { ensureIapReady, resetIapInitAfterDisconnect } from './iapConnection';
import { isTipProductId } from './tipProductIds';

async function finishTipPurchase(purchase: Purchase) {
  await finishTransaction({ purchase, isConsumable: true });
}

/**
 * Keeps the billing connection open and completes tip (consumable) purchases so
 * transactions do not linger across app restarts.
 */
export function TipIapBootstrap({ children }: { children: ReactNode }) {
  const connectedRef = useRef(false);

  useEffect(() => {
    const connect = async () => {
      const ok = await ensureIapReady();
      connectedRef.current = ok;
      if (ok && Platform.OS === 'android') {
        await flushFailedPurchasesCachedAsPendingAndroid().catch(() => {});
      }
    };

    void connect();

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
      if (connectedRef.current) {
        void endConnection().catch(() => {});
      }
      connectedRef.current = false;
      resetIapInitAfterDisconnect();
    };
  }, []);

  return children;
}
