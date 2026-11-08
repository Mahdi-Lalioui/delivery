import { useLocalSearchParams, useRouter } from "expo-router";
import { deviceLocale } from "../../../src/locale";
import { RatingScreen } from "../../../src/rating-screen";

export default function OrderRatingRoute() {
  const router = useRouter();
  const { fulfilment } = useLocalSearchParams<{ fulfilment?: string }>();
  return (
    <RatingScreen
      locale={deviceLocale()}
      isDelivery={fulfilment !== "pickup"}
      // TODO(M10-2): send to PUT /v1/orders/:orderId/rating once the API client and auth land.
      onSubmit={() => {
        router.back();
      }}
    />
  );
}
