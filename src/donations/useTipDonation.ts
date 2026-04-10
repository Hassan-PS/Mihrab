import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ErrorCode,
  getProducts,
  purchaseErrorListener,
  purchaseUpdatedListener,
  type Product,
} from 'react-native-iap';
import { ensureIapReady } from './iapConnection';
import { requestTipPurchase } from './requestTipPurchase';
import { isTipProductId, TIP_PRODUCT_SKUS } from './tipProductIds';

function formatPurchaseErrorMessage(
  code: string | undefined,
  message: string | undefined,
) {
  if (code === ErrorCode.E_USER_CANCELLED) {
    return null;
  }
  if (code === ErrorCode.E_ITEM_UNAVAILABLE) {
    return 'This tip is not available in your region or store yet.';
  }
  if (code === ErrorCode.E_NETWORK_ERROR) {
    return 'Network error. Check your connection and try again.';
  }
  if (code === ErrorCode.E_IAP_NOT_AVAILABLE) {
    return 'Purchases are not available on this device.';
  }
  if (code === ErrorCode.E_NOT_PREPARED) {
    return null;
  }
  if (message?.includes('Unable to auto-initialize connection')) {
    return null;
  }
  return message ?? 'Purchase could not be completed.';
}

export function useTipDonation() {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [thankYou, setThankYou] = useState(false);
  const thankYouTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearThankYouTimer = useCallback(() => {
    if (thankYouTimerRef.current) {
      clearTimeout(thankYouTimerRef.current);
      thankYouTimerRef.current = null;
    }
  }, []);

  const dismissThankYou = useCallback(() => {
    clearThankYouTimer();
    setThankYou(false);
  }, [clearThankYouTimer]);

  const loadProduct = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      const ready = await ensureIapReady();
      if (!ready) {
        setProduct(null);
        setError(null);
        return;
      }
      const items = await getProducts({ skus: [...TIP_PRODUCT_SKUS] });
      setProduct(items[0] ?? null);
    } catch (e) {
      const raw = e instanceof Error ? e.message : 'Could not load store products.';
      if (raw.includes('Unable to auto-initialize connection')) {
        setProduct(null);
        setError(null);
        return;
      }
      setError(raw);
      setProduct(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadProduct();
    }, [loadProduct]),
  );

  useEffect(() => {
    const sub = purchaseUpdatedListener(
      purchase => {
        if (!isTipProductId(purchase.productId)) {
          return;
        }
        setPurchasing(false);
        clearThankYouTimer();
        setThankYou(true);
        thankYouTimerRef.current = setTimeout(() => {
          setThankYou(false);
          thankYouTimerRef.current = null;
        }, 4000);
      },
      () => {},
    );

    return () => {
      sub.remove();
      clearThankYouTimer();
    };
  }, [clearThankYouTimer]);

  useEffect(() => {
    const sub = purchaseErrorListener(err => {
      setPurchasing(false);
      const msg = formatPurchaseErrorMessage(err.code, err.message);
      if (msg) {
        setError(msg);
      }
    });
    return () => sub.remove();
  }, []);

  const purchase = useCallback(async () => {
    if (!product || purchasing) {
      return;
    }
    setError(null);
    setPurchasing(true);
    try {
      const ready = await ensureIapReady();
      if (!ready) {
        setPurchasing(false);
        setError(null);
        return;
      }
      await requestTipPurchase();
    } catch (e) {
      setPurchasing(false);
      const msg = e instanceof Error ? e.message : 'Purchase failed.';
      if (msg.includes('Unable to auto-initialize connection')) {
        setError(null);
        return;
      }
      setError(msg);
    }
  }, [product, purchasing]);

  return {
    product,
    loading,
    purchasing,
    error,
    thankYou,
    dismissThankYou,
    purchase,
    refresh: loadProduct,
  };
}
