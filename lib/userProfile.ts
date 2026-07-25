let email: string | null = null;

export function setCachedUserEmail(value: string | null | undefined): void {
  email = value ?? null;
}

export function peekCachedUserEmail(): string | null {
  return email;
}
