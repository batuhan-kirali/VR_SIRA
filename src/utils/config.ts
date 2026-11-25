export interface FirebasePlaceholderConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
}

export type LogoStatus = 'loading' | 'loaded' | 'fallback';

/**
 * Checks whether the Firebase configuration has all required non-empty values
 * before attempting live SDK initialization.
 */
export function isFirebaseConfigReady(config: FirebasePlaceholderConfig): boolean {
  const requiredFields: (keyof FirebasePlaceholderConfig)[] = [
    'apiKey',
    'authDomain',
    'projectId',
    'appId',
  ];

  return requiredFields.every((field) => {
    const value = config[field];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

/**
 * Resolves logo display state based on image load outcome and natural dimensions.
 */
export function resolveLogoLoadState(naturalWidth: number, naturalHeight: number): LogoStatus {
  if (naturalWidth > 0 && naturalHeight > 0) {
    return 'loaded';
  }
  return 'fallback';
}
