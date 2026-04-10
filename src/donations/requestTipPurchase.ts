import { Platform } from 'react-native';
import { requestPurchase } from 'react-native-iap';
import { TIP_PRODUCT_SKUS } from './tipProductIds';

/** Starts the store purchase flow; completion arrives on `purchaseUpdatedListener`. */
export function requestTipPurchase(): Promise<unknown> {
  if (Platform.OS === 'android') {
    return requestPurchase({ skus: [...TIP_PRODUCT_SKUS] });
  }
  const sku = TIP_PRODUCT_SKUS[0];
  if (!sku) {
    return Promise.reject(new Error('No tip product SKU configured.'));
  }
  return requestPurchase({ sku });
}
