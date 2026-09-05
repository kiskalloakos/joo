import { requireOptionalNativeModule } from 'expo';

type ReceiptOCRModuleType = {
  recognizeText(uri: string): Promise<string[]>;
};

export const ReceiptOCRModule = requireOptionalNativeModule<ReceiptOCRModuleType>('ReceiptOCR');

export async function recognizeReceiptText(uri: string): Promise<string[]> {
  if (!ReceiptOCRModule) return [];
  return ReceiptOCRModule.recognizeText(uri);
}
