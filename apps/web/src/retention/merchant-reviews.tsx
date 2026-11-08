"use client";

import {
  Badge,
  Button,
  Card,
  ChipGroup,
  EmptyState,
  ErrorState,
  Icon,
  PageHeader,
  Skeleton,
  TextAreaField,
  useToast,
} from "@zaafran/ui";
import { useFormatter, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { isEditable, type MerchantReview } from "./ratings-http";
import { StarRow } from "./star-field";
import { useMerchantReviews, type MerchantReviewsState } from "./use-merchant-reviews";

type Filter = "all" | "5" | "4" | "3" | "2" | "1";
const filterValues = ["all", "5", "4", "3", "2", "1"] as const satisfies readonly Filter[];

function readText(form: HTMLFormElement, name: string): string {
  const value = new FormData(form).get(name);
  return typeof value === "string" ? value : "";
}

/** A disclosed text form: closed it is a quiet button; open it is a field with send/cancel. */
function TextAction(props: {
  name: string;
  open: string;
  label: string;
  submit: string;
  defaultValue?: string;
  variant: "ghost" | "danger-ghost";
  icon: "reply" | "flag";
  isDisabled: boolean;
  onText: (text: string) => void;
}) {
  const translate = useTranslations("retentionRatings");
  const [isOpen, setIsOpen] = useState(false);
  if (!isOpen) {
    return (
      <Button
        variant={props.variant}
        size="sm"
        icon={props.icon}
        disabled={props.isDisabled}
        onClick={() => {
          setIsOpen(true);
        }}
      >
        {props.open}
      </Button>
    );
  }
  return (
    <form
      className="review-action-form"
      onSubmit={(event) => {
        event.preventDefault();
        props.onText(readText(event.currentTarget, props.name));
        setIsOpen(false);
      }}
    >
      <TextAreaField
        label={props.label}
        name={props.name}
        required
        maxLength={500}
        defaultValue={props.defaultValue}
        disabled={props.isDisabled}
        autoFocus
      />
      <div className="billing-reason-actions">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setIsOpen(false);
          }}
        >
          {translate("cancel")}
        </Button>
        <Button type="submit" variant="primary" size="sm" isLoading={props.isDisabled}>
          {props.submit}
        </Button>
      </div>
    </form>
  );
}

function ReviewCard({ review, state }: { review: MerchantReview; state: MerchantReviewsState }) {
  const translate = useTranslations("retentionRatings");
  const format = useFormatter();
  const { reply } = review;
  const canReply = reply === null || isEditable(reply.editableUntil, Date.now());
  return (
    <li className="review-card">
      <div className="review-card-head">
        <StarRow
          value={review.foodStars}
          label={translate("foodScore", { count: review.foodStars })}
        />
        {review.deliveryStars !== null && (
          <Badge tone="neutral">
            <Icon name="bike" size={14} />
            {translate("deliveryScore", { count: review.deliveryStars })}
          </Badge>
        )}
        <time className="review-card-date" dateTime={review.createdAt}>
          {format.dateTime(new Date(review.createdAt), {
            day: "numeric",
            month: "short",
            timeZone: "Africa/Algiers",
          })}
        </time>
      </div>
      {review.comment === null ? (
        <p className="ui-field-hint">{translate("noComment")}</p>
      ) : (
        <p className="review-card-comment">{review.comment}</p>
      )}
      {reply !== null && (
        <div className="review-reply">
          <p className="rating-reply-label">
            <Icon name="reply" size={16} />
            {translate("yourReply")}
          </p>
          <p>{reply.body}</p>
        </div>
      )}
      <div className="review-card-actions">
        {canReply && (
          <TextAction
            name="reply"
            open={translate(reply === null ? "reply" : "editReply")}
            label={translate("reply")}
            submit={translate("sendReply")}
            defaultValue={reply?.body ?? ""}
            variant="ghost"
            icon="reply"
            isDisabled={state.isSaving}
            onText={(text) => {
              void state.reply(review.ratingId, text);
            }}
          />
        )}
        <TextAction
          name="reason"
          open={translate("report")}
          label={translate("reportReason")}
          submit={translate("sendReport")}
          variant="danger-ghost"
          icon="flag"
          isDisabled={state.isSaving}
          onText={(text) => {
            void state.report(review.ratingId, text);
          }}
        />
      </div>
    </li>
  );
}

function noticeKey(notice: NonNullable<MerchantReviewsState["notice"]>) {
  if (notice.result.kind === "saved")
    return notice.action === "reply" ? "replySaved" : "reportSaved";
  if (notice.result.kind === "invalid") return "textError";
  return notice.result.kind === "closed" ? "replyClosed" : "saveError";
}

function useNoticeToast(state: MerchantReviewsState) {
  const translate = useTranslations("retentionRatings");
  const toast = useToast();
  const { notice } = state;
  useEffect(() => {
    if (notice !== undefined)
      toast.show(
        translate(noticeKey(notice)),
        notice.result.kind === "saved" ? "success" : "danger",
      );
  }, [notice, toast, translate]);
}

function Filters({ state }: { state: MerchantReviewsState }) {
  const translate = useTranslations("retentionRatings");
  const options = filterValues.map((value) => ({
    value,
    label:
      value === "all" ? (
        translate("allStars")
      ) : (
        <>
          <Icon name="star" size={14} />
          {value}
        </>
      ),
  }));
  const current: Filter =
    state.stars === undefined ? "all" : (filterValues[6 - state.stars] ?? "all");
  return (
    <ChipGroup
      legend={translate("filter")}
      options={options}
      value={current}
      onChange={(value) => {
        state.filter(value === "all" ? undefined : Number(value));
      }}
    />
  );
}

const failureKeys = {
  "sign-in": "signInRequired",
  "not-found": "notFound",
  error: "loadError",
} as const;

/** MER-20 view (page and design gallery). */
export function MerchantReviewsView({ state }: { state: MerchantReviewsState }) {
  const translate = useTranslations("retentionRatings");
  useNoticeToast(state);
  const { view } = state;
  return (
    <section className="billing-page" aria-labelledby="merchant-reviews-title">
      <PageHeader
        title={translate("reviewsTitle")}
        intro={translate("reviewsIntro")}
        titleId="merchant-reviews-title"
      />
      <Filters state={state} />
      {view.kind === "loading" && <Skeleton label={translate("loading")} lines={6} />}
      {view.kind === "ready" && view.reviews.length === 0 && (
        <Card>
          <EmptyState
            icon="star"
            title={translate("noReviews")}
            body={translate("noReviewsBody")}
          />
        </Card>
      )}
      {view.kind === "ready" && view.reviews.length > 0 && (
        <ul className="review-list">
          {view.reviews.map((review) => (
            <ReviewCard key={review.ratingId} review={review} state={state} />
          ))}
        </ul>
      )}
      {view.kind === "ready" && view.nextCursor !== null && (
        <Button
          variant="secondary"
          isLoading={state.isPaging}
          onClick={() => {
            void state.loadMore();
          }}
        >
          {translate("loadMore")}
        </Button>
      )}
      {view.kind !== "loading" && view.kind !== "ready" && (
        <ErrorState title={translate(failureKeys[view.kind])} />
      )}
    </section>
  );
}

/** MER-20: list and filter reviews, reply once (editable 24 h), report abuse. */
export function MerchantReviews({ merchantId }: { merchantId: string }) {
  return <MerchantReviewsView state={useMerchantReviews(merchantId)} />;
}
