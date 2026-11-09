import { randomUUID } from "node:crypto";
import { expect, test, type APIRequestContext } from "@playwright/test";
import type { AuthHarness } from "../apps/api/tools/e2e-auth-types.ts";
import { requestOtpOutput, verifyOtpOutput } from "../packages/contracts/src/auth.ts";
import {
  customerPrivacyChallengeOutput,
  customerPrivacyExportOutput,
} from "../packages/contracts/src/retention.ts";
import { withAuthHarness } from "./auth-fixture.ts";

async function signIn(request: APIRequestContext, auth: AuthHarness, phone: string) {
  const send = await request.post(auth.origin + "/v1/auth/otp/request", {
    headers: { "idempotency-key": randomUUID() },
    data: { phone, purpose: "sign_in" },
  });
  expect(send.status()).toBe(202);
  const { challengeId } = requestOtpOutput.parse(await send.json());
  const verify = await request.post(auth.origin + "/v1/auth/otp/verify", {
    headers: { "idempotency-key": randomUUID() },
    data: { challengeId, transport: "bearer", code: auth.latestSms(phone) },
  });
  expect(verify.status()).toBe(200);
  const output = verifyOtpOutput.parse(await verify.json());
  if (output.status !== "authenticated" || output.transport !== "bearer")
    throw new Error("Expected a bearer session");
  return { authorization: "Bearer " + output.token };
}

test("[CUS-24:browser] exports customer data and replays deletion without reopening the session @privacy", async ({
  request,
  baseURL,
}) => {
  await withAuthHarness(baseURL, async (auth) => {
    const phone = "+213500000254";
    const deviceOne = await signIn(request, auth, phone);
    auth.advanceClock(60_000);
    const deviceTwo = await signIn(request, auth, phone);
    const url = auth.origin + "/v1/me";
    const exported = await request.get(url + "/export", { headers: deviceOne });
    expect(exported.status()).toBe(200);
    expect(customerPrivacyExportOutput.parse(await exported.json()).profile.phoneE164).toBe(phone);
    const headers = { ...deviceOne, "idempotency-key": randomUUID() };
    const send = await request.post(url + "/deletion-challenge", { headers });
    expect(send.status()).toBe(201);
    const challenge = customerPrivacyChallengeOutput.parse(await send.json());
    const same = await request.post(url + "/deletion-challenge", { headers });
    expect(same.status()).toBe(201);
    expect(await same.json()).toEqual(challenge);
    const input = {
      headers: deviceOne,
      data: { challengeId: challenge.challengeId, code: auth.latestSms(phone) },
    };
    auth.advanceClock(299_000);
    expect((await request.delete(url, input)).status()).toBe(204);
    auth.advanceClock(2_000);
    expect((await request.delete(url, input)).status()).toBe(204);
    expect((await request.get(url + "/export", { headers: deviceOne })).status()).toBe(401);
    expect((await request.get(url + "/export", { headers: deviceTwo })).status()).toBe(401);
    expect((await request.delete(url, { ...input, headers: deviceTwo })).status()).toBe(401);
  });
});

test("[CUS-24:browser] the privacy page exports and confirms deletion over a web session @privacy", async ({
  page,
  baseURL,
}) => {
  await withAuthHarness(baseURL, async (auth) => {
    const phone = "+213500000255";
    await page.goto(auth.origin + "/fr/sign-in");
    await page.getByRole("textbox", { name: "Numéro de mobile" }).fill("0500000255");
    await page.getByRole("button", { name: "Envoyer le code" }).click();
    const loginCode = page.getByRole("textbox", { name: "Code SMS" });
    await expect(loginCode).toBeVisible();
    await loginCode.fill(auth.latestSms(phone));
    await loginCode.press("Enter");
    await expect(page.getByRole("heading", { name: "Vous êtes connecté" })).toBeVisible();

    await page.goto(auth.origin + "/fr/account/privacy");
    const exportResponse = page.waitForResponse((response) =>
      response.url().endsWith("/v1/me/export"),
    );
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "Télécharger mes données" }).click();
    const exported = await exportResponse;
    expect(exported.status()).toBe(200);
    expect(customerPrivacyExportOutput.parse(await exported.json()).profile.phoneE164).toBe(phone);
    expect((await download).suggestedFilename()).toBe("mes-donnees.json");

    const pendingChallenge = page.waitForResponse((response) =>
      response.url().endsWith("/v1/me/deletion-challenge"),
    );
    await page.getByRole("button", { name: "Recevoir un code de confirmation" }).click();
    const challengeResponse = await pendingChallenge;
    expect(challengeResponse.status()).toBe(201);
    const { challengeId } = customerPrivacyChallengeOutput.parse(await challengeResponse.json());
    const session = (await page.context().cookies(auth.origin)).find(
      (cookie) => cookie.name === "__Host-session",
    );
    if (!session) throw new Error("Expected a web session cookie");
    const cookie = session.name + "=" + session.value;
    const code = auth.latestSms(phone);
    const replay = { challengeId, code };
    const foreign = await page.request.delete(auth.origin + "/v1/me", {
      data: replay,
      headers: { cookie, origin: "https://foreign.example" },
    });
    expect(foreign.status()).toBe(403);
    const deletionCode = page.getByRole("textbox", { name: "Code reçu par SMS" });
    await expect(deletionCode).toBeVisible();
    await deletionCode.fill(code);
    const confirm = page.getByRole("button", { name: "Supprimer définitivement" });
    const deleted = page.getByRole("region", { name: "Compte supprimé" });
    const endpoint = auth.origin + "/v1/me";
    for (const status of [401, 403]) {
      await page.route(endpoint, (route) => route.abort("failed"), { times: 1 });
      await confirm.click();
      await expect(page.locator(".privacy-confirm").getByRole("alert")).toContainText(
        "Nous n’avons pas pu confirmer",
      );
      await page.route(endpoint, (route) => route.fulfill({ status }), { times: 1 });
      await confirm.click();
      await expect(page.locator(".privacy-confirm").getByRole("alert")).toContainText(
        "Connectez-vous",
      );
      await expect(deleted).toHaveCount(0);
    }
    await confirm.click();
    await expect(page.getByRole("region", { name: "Compte supprimé" })).toBeVisible();
    expect((await page.request.get(auth.origin + "/v1/me/export")).status()).toBe(401);
    const repeated = await page.request.delete(auth.origin + "/v1/me", {
      data: replay,
      headers: { cookie, origin: auth.origin },
    });
    expect(repeated.status()).toBe(204);
  });
});
