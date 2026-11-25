/**
 * Determines whether the current URL pathname or hash points to the staff admin panel.
 * Supports both "/admin" (direct path) and "#/admin" (hash routing for preview environments).
 */
export function isAdminLocation(pathname: string, hash: string): boolean {
  const normalizedPath = pathname.trim().toLowerCase().replace(/\/+$/, '');
  if (normalizedPath === '/admin') {
    return true;
  }

  const normalizedHash = hash.trim().toLowerCase().replace(/\/+$/, '');
  if (normalizedHash === '#/admin' || normalizedHash === '#admin') {
    return true;
  }

  return false;
}

/**
 * Checks window.location safely in browser environments.
 */
export function isCurrentWindowAdmin(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return isAdminLocation(window.location.pathname, window.location.hash);
}
