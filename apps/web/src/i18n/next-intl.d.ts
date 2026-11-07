import type { Messages } from "@zaafran/i18n/messages";

declare module "next-intl" {
  interface AppConfig {
    Messages: Messages;
  }
}
