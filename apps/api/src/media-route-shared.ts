import type { createMediaRepository } from "@zaafran/db/media";
import type { MediaStore } from "@zaafran/media";

export interface MediaReservationServices {
  readonly repository: ReturnType<typeof createMediaRepository>;
  readonly store: MediaStore;
  readonly now: () => Date;
}

export const privatePhotoPolicy = {
  policy: {
    kind: "roles",
    roles: ["customer", "merchant_owner", "merchant_manager", "merchant_staff", "courier"],
  },
} as const;
