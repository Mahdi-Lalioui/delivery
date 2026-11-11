export interface AlgiersCommune {
  readonly id: string;
  readonly nameAr: string;
  readonly nameFr: string;
  readonly pin: { readonly latitude: number; readonly longitude: number };
}

export interface MenuMembershipFixture {
  readonly merchantId: string;
  readonly restaurantName: string;
  readonly role: "owner" | "manager" | "staff";
}

export interface AuthHarness {
  readonly origin: string;
  close(): Promise<void>;
  advanceClock(milliseconds: number): void;
  latestSms(phone: string): string;
  latestInvitation(phone: string): string;
  phoneForSession(sessionId: string): Promise<string | undefined>;
  seedAdmin(phone: string): Promise<() => string>;
  seedAlgiersCommune(): Promise<AlgiersCommune>;
  seedDiscoverySearch(): Promise<AlgiersCommune>;
  seedDiscoveryFeed(): Promise<{ publishedName: string; hiddenName: string }>;
  seedMenuMemberships(phone: string): Promise<readonly MenuMembershipFixture[]>;
  seedOnboardingProgress(merchantId: string): Promise<void>;
}
