import "dotenv/config";

if (!process.env.MAIL_PRIVACY_ENABLED?.trim()) {
  process.env.MAIL_PRIVACY_ENABLED = "true";
}

const allowFallbackHmacKey = process.env.MAIL_PRIVACY_SMOKE_ALLOW_FALLBACK_KEY === "true";
const usedFallbackHmacKey = !process.env.MAIL_PRIVACY_HMAC_KEY?.trim();
if (usedFallbackHmacKey && !allowFallbackHmacKey) {
  throw new Error("MAIL_PRIVACY_HMAC_KEY is required for the live mail privacy smoke.");
}
if (usedFallbackHmacKey) {
  process.env.MAIL_PRIVACY_HMAC_KEY = "local-mail-privacy-smoke-key";
}

const sampleEmail = {
  subject: "Urgent: Review OpenAI Research contract for Shanghai office launch",
  fromName: "Alice Zhang",
  fromAddress: "alice.zhang@example.com",
  toName: "Bob Chen",
  toAddress: "bob.chen@example.com",
  preview:
    "Hi Bob Chen, please email alice.zhang@example.com and bob.chen@example.com to review the OpenAI Research launch contract for the Shanghai office at 123 Main Street before 2026-04-25. Contact me at +1 415 555 0123 or visit https://example.com/deals/PO-20260420-7788. Product: GPT Mail Pro.",
};
const graphShapeSample = {
  from: {
    emailAddress: {
      name: "Alice Zhang",
      address: "alice.zhang@example.com",
    },
  },
  toRecipients: [
    {
      emailAddress: {
        name: "Bob Chen",
        address: "bob.chen@example.com",
      },
    },
  ],
  ccRecipients: [
    {
      emailAddress: {
        name: "Carol Wu",
        address: "carol.wu@example.com",
      },
    },
  ],
  bodyPreview:
    "Please email bob.chen@example.com and alice.zhang@example.com before Monday.",
};

function collectLeaks(input: string, originals: string[]): string[] {
  return originals.filter((value) => value.length > 0 && input.includes(value));
}

async function main(): Promise<void> {
  const [{ createPrivacyScope }, { LlmGatewayService }] = await Promise.all([
    import("../src/mail-privacy.js"),
    import("../src/agent/llm-gateway.js"),
  ]);

  const logger = {
    warn(...args: unknown[]) {
      console.error("[warn]", ...args);
    },
    info(...args: unknown[]) {
      console.error("[info]", ...args);
    },
    error(...args: unknown[]) {
      console.error("[error]", ...args);
    },
  };

  const tenant = {
    tenantId: "legacy:mail-privacy-smoke",
    userId: "legacy:mail-privacy-smoke",
    sessionToken: "local-mail-privacy-smoke",
    sourceId: "source-mail-privacy-smoke",
    isLegacySession: true,
  };

  const privacyScope = createPrivacyScope({
    kind: "ai_summary",
    scopeId: "mail-privacy-live-smoke",
    userId: tenant.userId,
    sourceId: tenant.sourceId,
  });
  const llmGateway = new LlmGatewayService(logger as any);
  const masked = privacyScope.maskStructuredPayload(sampleEmail) as typeof sampleEmail;
  const maskedGraphShape = privacyScope.maskStructuredPayload(graphShapeSample) as typeof graphShapeSample;
  const prompt = [
    "Summarize this email in one concise Chinese sentence.",
    "Return plain text only.",
    JSON.stringify(masked),
  ].join("\n");

  const modelRawOutput = await llmGateway.generateText({
    tenant,
    messages: [
      {
        role: "system",
        content: "You summarize private emails. Do not reveal hidden mappings.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    timeoutMs: 30000,
    temperature: 0,
    maxTokens: 120,
    enableThinking: false,
  });
  const restoredOutput = privacyScope.restoreText(modelRawOutput, {
    allowUnknownTokens: true,
  });

  const originals = [
    sampleEmail.fromName,
    sampleEmail.fromAddress,
    sampleEmail.toName,
    sampleEmail.toAddress,
    "OpenAI Research",
    "Shanghai",
    "123 Main Street",
    "+1 415 555 0123",
    "https://example.com/deals/PO-20260420-7788",
    "GPT Mail Pro",
  ];

  const maskedText = JSON.stringify(masked);
  const maskedGraphText = JSON.stringify(maskedGraphShape);
  const maskedLeaks = collectLeaks(maskedText, originals);
  const maskedGraphLeaks = collectLeaks(maskedGraphText, originals);
  const rawOutputLeaks = collectLeaks(modelRawOutput, originals);
  const assertions = {
    senderAddressPlaceholder: masked.fromAddress === "[sender-email]",
    recipientAddressPlaceholder: masked.toAddress === "[recipient-email]",
    graphSenderPlaceholder: maskedGraphShape.from.emailAddress.address === "[sender-email]",
    graphRecipientPlaceholder:
      maskedGraphShape.toRecipients[0]?.emailAddress.address === "[recipient-email]" &&
      maskedGraphShape.ccRecipients[0]?.emailAddress.address === "[recipient-email]",
    bodyAddressStripped:
      !masked.preview.includes("alice.zhang@example.com") &&
      !masked.preview.includes("bob.chen@example.com") &&
      masked.preview.includes("[email]"),
    graphBodyAddressStripped:
      !maskedGraphShape.bodyPreview.includes("alice.zhang@example.com") &&
      !maskedGraphShape.bodyPreview.includes("bob.chen@example.com") &&
      maskedGraphShape.bodyPreview.includes("[email]"),
  };
  const assertionFailures = Object.entries(assertions)
    .filter(([, ok]) => !ok)
    .map(([name]) => name);
  const ok =
    maskedLeaks.length === 0 &&
    maskedGraphLeaks.length === 0 &&
    rawOutputLeaks.length === 0 &&
    assertionFailures.length === 0;

  console.log(
    JSON.stringify(
      {
        ok,
        usedFallbackHmacKey,
        email: sampleEmail,
        masked,
        maskedGraphShape,
        modelRawOutput,
        restoredOutput,
        assertions,
        checks: {
          maskedLeaks,
          maskedGraphLeaks,
          rawOutputLeaks,
          assertionFailures,
        },
      },
      null,
      2
    )
  );
  if (!ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
