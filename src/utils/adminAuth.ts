export interface AdminLoginValidation {
  valid: boolean;
  errorMessage: string | null;
}

const SIMPLE_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateAdminCredentials(email: string, password: string): AdminLoginValidation {
  const trimmedEmail = email.trim();
  if (!trimmedEmail) {
    return { valid: false, errorMessage: 'Lütfen e-posta adresinizi girin.' };
  }
  if (!SIMPLE_EMAIL_REGEX.test(trimmedEmail)) {
    return { valid: false, errorMessage: 'Geçerli bir e-posta adresi girin.' };
  }
  if (!password) {
    return { valid: false, errorMessage: 'Lütfen şifrenizi girin.' };
  }
  return { valid: true, errorMessage: null };
}

/**
 * Translates Firebase Auth errors into short, clear Turkish messages for staff login.
 */
export function formatFirebaseAuthError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';

  switch (code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'E-posta veya şifre hatalı.';
    case 'auth/invalid-email':
      return 'Geçerli bir e-posta adresi girin.';
    case 'auth/user-disabled':
      return 'Bu görevli hesabı devre dışı bırakılmış.';
    case 'auth/too-many-requests':
      return 'Çok fazla başarısız deneme yapıldı. Lütfen kısa süre sonra tekrar deneyin.';
    case 'auth/network-request-failed':
      return 'İnternet bağlantısı kurulamadı. Lütfen tekrar deneyin.';
    default:
      return 'Giriş yapılamadı. Bilgilerinizi kontrol edip tekrar deneyin.';
  }
}
