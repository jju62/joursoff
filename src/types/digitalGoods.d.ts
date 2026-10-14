export {};

declare global {
  interface Window {
    getDigitalGoodsService?: (
      paymentMethod: string,
    ) => Promise<DigitalGoodsService>;
  }

  interface DigitalGoodsService {
    getDetails: (itemIds: string[]) => Promise<Array<{ itemId: string }>>;
    makePurchase: (options: { sku: string }) => Promise<{ purchaseToken?: string }>;
  }
}
