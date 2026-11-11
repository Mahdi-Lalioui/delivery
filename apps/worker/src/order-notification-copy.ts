import type { customerPushStatus } from "@zaafran/contracts/push";

type Status = ReturnType<typeof customerPushStatus.parse>;
export type OrderLocale = "ar" | "fr" | "en";

export const orderNotificationCopy: Readonly<
  Record<OrderLocale, Readonly<Record<Status, string>>>
> = {
  ar: {
    accepted: "قبل المطعم الطلب",
    ready: "طلبك جاهز للاستلام",
    out_for_delivery: "طلبك في الطريق",
    delivered: "تم توصيل الطلب",
    collected: "تم استلام الطلب",
    rejected: "لم يقبل المطعم الطلب",
    expired: "انتهت مهلة تأكيد الطلب",
    cancelled: "أُلغي الطلب",
    delivery_failed: "تعذّر توصيل الطلب",
  },
  fr: {
    accepted: "Commande acceptée",
    ready: "Commande prête à retirer",
    out_for_delivery: "Commande en route",
    delivered: "Commande livrée",
    collected: "Commande retirée",
    rejected: "Commande refusée",
    expired: "Commande expirée",
    cancelled: "Commande annulée",
    delivery_failed: "Livraison impossible",
  },
  en: {
    accepted: "Order accepted",
    ready: "Order ready for pickup",
    out_for_delivery: "Order on the way",
    delivered: "Order delivered",
    collected: "Order collected",
    rejected: "Order declined",
    expired: "Order expired",
    cancelled: "Order cancelled",
    delivery_failed: "Delivery failed",
  },
};
