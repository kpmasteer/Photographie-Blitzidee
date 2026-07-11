export interface AuthSession { userId: string; displayName?: string; expiresAt?: string; }
export interface AuthService { session(): Promise<AuthSession | null>; lock(): Promise<void>; unlock(credential: string): Promise<boolean>; signOut(): Promise<void>; }

export class LocalUnlockedAuthService implements AuthService {
  async session() { return { userId: "local-device", displayName: "Lokales Gerät" }; }
  async lock() { /* Grundlage für späteren PIN-/Passkey-Schutz. */ }
  async unlock() { return true; }
  async signOut() { /* Im Local-only-Modus existiert keine Cloud-Sitzung. */ }
}
