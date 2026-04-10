/**
 * In-app “tip” product IDs. Create matching products in both stores (publisher account):
 * - App Store Connect: consumable in-app purchase with the same product ID.
 * - Play Console: managed in-app product (one-time), same product ID.
 *
 * You can use one shared ID across iOS and Android, or split per platform below.
 */
export const TIP_PRODUCT_SKUS: string[] = ['com.prayerapp.developer_tip'];

export function isTipProductId(productId: string): boolean {
  return TIP_PRODUCT_SKUS.includes(productId);
}
