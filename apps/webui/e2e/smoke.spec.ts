import { expect, test, type Page } from "@playwright/test";

test.describe("webui smoke", () => {
  async function mockAuthenticatedApp(page: Page, options?: { tutorialCompleted?: boolean }) {
    const tutorialCompleted = options?.tutorialCompleted ?? true;
    let activeSourceIdState = "smoke-source";
    const sourcesState = [
      {
        id: "smoke-source",
        name: "Smoke Outlook",
        provider: "outlook",
        connectionType: "microsoft",
        microsoftAccountId: "smoke-account",
        emailHint: "smoke@example.com",
        enabled: true,
        ready: true,
        createdAt: "2026-04-17T00:00:00.000Z",
        updatedAt: "2026-04-17T00:00:00.000Z",
      },
      {
        id: "archive-source",
        name: "Archive Outlook",
        provider: "outlook",
        connectionType: "microsoft",
        microsoftAccountId: "archive-account",
        emailHint: "archive@example.com",
        enabled: true,
        ready: true,
        createdAt: "2026-04-17T00:00:00.000Z",
        updatedAt: "2026-04-17T00:00:00.000Z",
      },
    ];
    let notificationPrefsBySource = {
      "smoke-source": {
        urgentPushEnabled: true,
        dailyDigestEnabled: true,
        digestHour: 20,
        digestMinute: 0,
        digestTimeZone: "Asia/Shanghai",
        updatedAt: "2026-04-17T00:00:00.000Z",
      },
      "archive-source": {
        urgentPushEnabled: true,
        dailyDigestEnabled: false,
        digestHour: 7,
        digestMinute: 45,
        digestTimeZone: "Europe/London",
        updatedAt: "2026-04-17T00:00:00.000Z",
      },
    };
    const notificationStateBySource = {
      "smoke-source": {
        seenUrgentCount: 0,
        lastDigestDateKey: null,
        lastDigestSentAt: null,
      },
      "archive-source": {
        seenUrgentCount: 0,
        lastDigestDateKey: null,
        lastDigestSentAt: null,
      },
    };
    const buildNotificationSnapshot = (sourceId: keyof typeof notificationPrefsBySource) => ({
      sourceId,
      generatedAt: "2026-04-17T08:00:00.000Z",
      preferences: notificationPrefsBySource[sourceId],
      state: notificationStateBySource[sourceId],
      triage: {
        total: 3,
        counts: {
          unprocessed: 0,
          urgent_important: 1,
          not_urgent_important: 1,
          urgent_not_important: 1,
          not_urgent_not_important: 0,
        },
      },
      urgent: {
        totalUrgentImportant: 1,
        newItems: [
          {
            messageId: "urgent-1",
            subject: "Urgent lab deadline",
            fromName: "Advisor Li",
            fromAddress: "advisor@example.com",
            receivedDateTime: "2026-04-17T00:00:00.000Z",
            webLink: "https://outlook.example/messages/urgent-1",
            reasons: ["deadline", "tomorrow"],
          },
        ],
      },
      dailyDigest: {
        triggeredAt: "2026-04-17T08:00:00.000Z",
        dateKey: "2026-04-17",
        timeZone: "Asia/Shanghai",
        digest: {
          date: "2026-04-17",
          total: 3,
          unread: 2,
          urgentImportant: 1,
          highImportance: 2,
          upcomingCount: 2,
          tomorrowDdlCount: 1,
        },
        tomorrowDdl: [
          {
            messageId: "urgent-1",
            subject: "Urgent lab deadline",
            dueDateLabel: "4月18日 10:00",
          },
        ],
        upcoming: [
          {
            messageId: "meeting-1",
            subject: "Project sync meeting",
            type: "meeting",
            dueDateLabel: "4月18日 14:00",
          },
        ],
      },
    });
    const notificationSnapshot = {
      ...buildNotificationSnapshot("smoke-source"),
      state: {
        seenUrgentCount: 1,
        lastDigestDateKey: "2026-04-17",
        lastDigestSentAt: "2026-04-17T08:00:00.000Z",
      },
    };

    await page.addInitScript(({ payload, tutorialCompleted: seededTutorialCompleted }) => {
      if (seededTutorialCompleted) {
        window.localStorage.setItem("mail-agent-tutorial:smoke-user", "done");
      } else {
        window.localStorage.removeItem("mail-agent-tutorial:smoke-user");
      }
      class MockEventSource {
        static CONNECTING = 0;
        static OPEN = 1;
        static CLOSED = 2;
        readyState = MockEventSource.CONNECTING;
        url: string;
        withCredentials: boolean;
        listeners: Record<string, Array<(event: { data?: string }) => void>> = {};

        constructor(url: string | URL, init?: { withCredentials?: boolean }) {
          this.url = String(url);
          this.withCredentials = Boolean(init?.withCredentials);
          (window as typeof window & { __mockNotificationStreamUrl?: string }).__mockNotificationStreamUrl = this.url;

          window.setTimeout(() => {
            if (this.readyState === MockEventSource.CLOSED) {
              return;
            }
            this.readyState = MockEventSource.OPEN;
            this.emit("open", {});
            this.emit("notification", {
              data: JSON.stringify({
                ok: true,
                result: payload,
              }),
            });
          }, 0);
        }

        addEventListener(type: string, handler: (event: { data?: string }) => void) {
          this.listeners[type] ??= [];
          this.listeners[type].push(handler);
        }

        removeEventListener(type: string, handler: (event: { data?: string }) => void) {
          this.listeners[type] = (this.listeners[type] ?? []).filter((entry) => entry !== handler);
        }

        close() {
          this.readyState = MockEventSource.CLOSED;
        }

        emit(type: string, event: { data?: string }) {
          for (const handler of this.listeners[type] ?? []) {
            handler(event);
          }
        }
      }

      Object.defineProperty(window, "EventSource", {
        configurable: true,
        writable: true,
        value: MockEventSource,
      });
    }, {
      payload: notificationSnapshot,
      tutorialCompleted,
    });

    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          authenticated: true,
          user: {
            id: "smoke-user",
            email: "smoke@example.com",
            displayName: "Smoke User",
            locale: "zh-CN",
          },
        }),
      });
    });

    await page.route("**/api/mail/sources", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          result: {
            activeSourceId: activeSourceIdState,
            sources: sourcesState,
          },
        }),
      });
    });

    await page.route("**/api/mail/sources/select", async (route) => {
      const body = route.request().postDataJSON() as { id?: string } | null;
      expect(body?.id).toBeTruthy();
      expect(sourcesState.some((source) => source.id === body?.id)).toBe(true);
      activeSourceIdState = body?.id ?? activeSourceIdState;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          result: {
            activeSourceId: activeSourceIdState,
          },
        }),
      });
    });

    await page.route("**/api/mail/notifications/preferences**", async (route) => {
      const requestUrl = new URL(route.request().url());
      const querySourceId = requestUrl.searchParams.get("sourceId");
      if (route.request().method() !== "POST") {
        expect(querySourceId).toBeTruthy();
      }
      let sourceId = querySourceId ?? activeSourceIdState;

      if (route.request().method() === "POST") {
        const body = route.request().postDataJSON() as
          | ({ sourceId?: string } & Partial<(typeof notificationPrefsBySource)["smoke-source"]>)
          | null;
        const { sourceId: bodySourceId, ...prefsPatch } = body ?? {};
        expect(bodySourceId).toBeTruthy();
        sourceId = bodySourceId ?? sourceId;
        expect(sourceId in notificationPrefsBySource).toBe(true);
        notificationPrefsBySource = {
          ...notificationPrefsBySource,
          [sourceId]: {
            ...notificationPrefsBySource[sourceId as keyof typeof notificationPrefsBySource],
            ...prefsPatch,
          },
        };
        notificationPrefsBySource[sourceId as keyof typeof notificationPrefsBySource] = {
          ...notificationPrefsBySource[sourceId as keyof typeof notificationPrefsBySource],
          updatedAt: "2026-04-18T00:00:00.000Z",
        };
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          result: {
            sourceId,
            preferences: notificationPrefsBySource[sourceId as keyof typeof notificationPrefsBySource],
            state: notificationStateBySource[sourceId as keyof typeof notificationStateBySource],
          },
        }),
      });
    });

    await page.route("**/api/mail/notifications/poll**", async (route) => {
      const url = new URL(route.request().url());
      const sourceId = url.searchParams.get("sourceId");
      expect(sourceId).toBeTruthy();
      expect(url.searchParams.get("limit")).not.toBeNull();
      expect(url.searchParams.get("horizonDays")).not.toBeNull();
      expect(url.searchParams.get("tz")).not.toBeNull();

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          result: sourceId === "smoke-source" ? notificationSnapshot : buildNotificationSnapshot("archive-source"),
        }),
      });
    });

    await page.route("**/api/mail/calendar/sync/batch", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          result: {
            sourceId: "smoke-source",
            total: 1,
            createdCount: 1,
            deduplicatedCount: 0,
            failedCount: 0,
            items: [
              {
                key: "urgent-1:ddl:2026-04-18T10:00:00.000Z",
                messageId: "urgent-1",
                type: "ddl",
                dueAt: "2026-04-18T10:00:00.000Z",
                ok: true,
                deduplicated: false,
                result: {
                  eventId: "evt-1",
                  eventSubject: "Urgent lab deadline",
                  eventWebLink: "https://outlook.example/calendar/evt-1",
                  start: {
                    dateTime: "2026-04-18T10:00:00.000Z",
                    timeZone: "Asia/Shanghai",
                  },
                  end: {
                    dateTime: "2026-04-18T11:00:00.000Z",
                    timeZone: "Asia/Shanghai",
                  },
                },
              },
            ],
          },
        }),
      });
    });

    await page.route("**/api/mail/priority-rules", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          result: {
            rules: [],
          },
        }),
      });
    });

    await page.route("**/api/mail/triage**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          result: {
            generatedAt: "2026-04-17T00:00:00.000Z",
            total: 0,
            counts: {
              unprocessed: 0,
              urgent_important: 0,
              not_urgent_important: 0,
              urgent_not_important: 0,
              not_urgent_not_important: 0,
            },
            quadrants: {
              unprocessed: [],
              urgent_important: [],
              not_urgent_important: [],
              urgent_not_important: [],
              not_urgent_not_important: [],
            },
            allItems: [],
          },
        }),
      });
    });

    await page.route("**/api/mail/insights**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          result: {
            generatedAt: "2026-04-17T00:00:00.000Z",
            horizonDays: 7,
            timeZone: "Asia/Shanghai",
            digest: {
              total: 0,
              unread: 0,
              urgentImportant: 0,
              highImportance: 0,
              upcomingCount: 0,
              tomorrowDdlCount: 0,
            },
            upcoming: [],
            tomorrowDdl: [],
            signalsWithoutDate: [],
          },
        }),
      });
    });

    await page.route("**/api/mail/processing/run", async (route) => {
      const body = route.request().postDataJSON() as
        | { sourceId?: string; limit?: number; horizonDays?: number; tz?: string }
        | null;
      expect(body?.sourceId).toBe(activeSourceIdState);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          sourceId: "smoke-source",
          result: {
            status: "completed",
            warnings: [],
            sourceId: "smoke-source",
            startedAt: "2026-04-17T00:00:00.000Z",
            completedAt: "2026-04-17T00:01:00.000Z",
            limit: 30,
            horizonDays: 14,
            timeZone: "Asia/Shanghai",
            knowledgeBase: {
              status: "completed",
              processedCount: 1,
              newMailCount: 1,
              updatedMailCount: 0,
              newEventCount: 1,
              updatedEventCount: 0,
              newSenderCount: 1,
              updatedSenderCount: 0,
              errors: [],
            },
            triage: {
              total: 1,
              counts: {
                unprocessed: 0,
                urgent_important: 1,
                not_urgent_important: 0,
                urgent_not_important: 0,
                not_urgent_not_important: 0,
              },
            },
            urgent: {
              totalUrgentImportant: 1,
              newItems: [
                {
                  messageId: "urgent-1",
                  subject: "Urgent lab deadline",
                  fromName: "Advisor Li",
                  fromAddress: "advisor@example.com",
                  receivedDateTime: "2026-04-17T00:00:00.000Z",
                  webLink: "https://outlook.example/messages/urgent-1",
                  reasons: ["deadline"],
                },
              ],
            },
            dailyDigest: null,
            calendarDrafts: [
              {
                messageId: "urgent-1",
                subject: "Urgent lab deadline",
                type: "ddl",
                dueAt: "2026-04-18T10:00:00.000Z",
                dueDateLabel: "2026年4月18日 10:00",
                confidence: 0.92,
              },
            ],
          },
        }),
      });
    });

    await page.route("**/api/mail-kb/stats**", async (route) => {
      const sourceId = new URL(route.request().url()).searchParams.get("sourceId");
      expect(sourceId).toBeTruthy();
      expect(sourcesState.some((source) => source.id === sourceId)).toBe(true);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          result: {
            stats: {
              totalMails: 0,
              totalEvents: 0,
              totalPersons: 0,
              processedAt: "2026-04-17T00:00:00.000Z",
              dateRange: {
                start: "",
                end: "",
              },
              quadrantDistribution: {
                unprocessed: 0,
                urgent_important: 0,
                not_urgent_important: 0,
                urgent_not_important: 0,
                not_urgent_not_important: 0,
              },
            },
          },
        }),
      });
    });

    await page.route("**/api/mail-kb/mails**", async (route) => {
      const sourceId = new URL(route.request().url()).searchParams.get("sourceId");
      expect(sourceId).toBeTruthy();
      expect(sourcesState.some((source) => source.id === sourceId)).toBe(true);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          result: {
            mails: [],
            total: 0,
            limit: 50,
            offset: 0,
          },
        }),
      });
    });

    await page.route("**/api/mail-kb/events**", async (route) => {
      const sourceId = new URL(route.request().url()).searchParams.get("sourceId");
      expect(sourceId).toBeTruthy();
      expect(sourcesState.some((source) => source.id === sourceId)).toBe(true);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          result: {
            events: [],
          },
        }),
      });
    });

    await page.route("**/api/mail-kb/persons**", async (route) => {
      const sourceId = new URL(route.request().url()).searchParams.get("sourceId");
      expect(sourceId).toBeTruthy();
      expect(sourcesState.some((source) => source.id === sourceId)).toBe(true);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          result: {
            persons: [],
          },
        }),
      });
    });

    await page.route("**/api/mail-kb/artifacts**", async (route) => {
      const sourceId = new URL(route.request().url()).searchParams.get("sourceId");
      expect(sourceId).toBeTruthy();
      expect(sourcesState.some((source) => source.id === sourceId)).toBe(true);
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          result: {
            artifacts: [
              {
                key: "mailIds",
                label: "邮件标识码清单",
                path: "/tmp/mail-ids.md",
              },
              {
                key: "subjects",
                label: "邮件题目索引",
                path: "/tmp/mail-subject-index.md",
              },
              {
                key: "scores",
                label: "邮件评分索引",
                path: "/tmp/mail-score-index.md",
              },
            ],
            baselineStatus: {
              backfillCompleted: false,
            },
          },
        }),
      });
    });

    await page.route("**/api/mail-kb/artifacts/content**", async (route) => {
      const url = new URL(route.request().url());
      const key = url.searchParams.get("key");
      const sourceId = url.searchParams.get("sourceId");
      expect(sourceId).toBeTruthy();
      expect(sourcesState.some((source) => source.id === sourceId)).toBe(true);
      const artifactBodies: Record<string, { label: string; path: string; content: string; kind: "markdown" | "json" }> = {
        mailIds: {
          label: "邮件标识码清单",
          path: "/tmp/mail-ids.md",
          kind: "markdown",
          content: "# 邮件标识码清单\n\n1. MSG_1\n2. MSG_2\n",
        },
        subjects: {
          label: "邮件题目索引",
          path: "/tmp/mail-subject-index.md",
          kind: "markdown",
          content: "# 邮件题目索引\n\n| 标识码 | 题目 |\n| --- | --- |\n| MSG_1 | Tomorrow final report deadline |\n",
        },
        scores: {
          label: "邮件评分索引",
          path: "/tmp/mail-score-index.md",
          kind: "markdown",
          content: "# 邮件评分索引\n\n| 标识码 | 重要性 | 紧急性 |\n| --- | --- | --- |\n| MSG_1 | 0.95/1 | 0.98/1 |\n",
        },
        summaries: {
          label: "邮件总结正文库",
          path: "/tmp/mail-summaries.md",
          kind: "markdown",
          content: "# 邮件总结正文库\n\n## MSG_1 | Tomorrow final report deadline\nNeed to submit the final report by tomorrow.\n",
        },
        events: {
          label: "事件聚类索引",
          path: "/tmp/event-clusters.md",
          kind: "markdown",
          content: "# 事件聚类索引\n\n## EVT_1 | Final Report\nFinal submission event\n",
        },
        senders: {
          label: "发件人画像索引",
          path: "/tmp/sender-profiles.md",
          kind: "markdown",
          content: "# 发件人画像索引\n\n## PER_1 | PM Zhang\nProject manager\n",
        },
        baseline: {
          label: "旧邮件归档状态",
          path: "/tmp/baseline-status.json",
          kind: "json",
          content: '{\n  "backfillCompleted": false\n}\n',
        },
      };
      const artifact = artifactBodies[key ?? ""] ?? artifactBodies.mailIds;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          result: {
            key: key ?? "mailIds",
            label: artifact.label,
            path: artifact.path,
            kind: artifact.kind,
            content: artifact.content,
          },
        }),
      });
    });
  }

  test("loads the React application shell", async ({ page }) => {
    const response = await page.goto("/");

    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("#root")).toBeAttached();
    await expect(page.locator("#root > *").first()).toBeVisible({ timeout: 15000 });
  });

  test("renders the unauthenticated entry flow without critical console errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    await page.route("**/api/auth/session", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          authenticated: false,
          user: null,
        }),
      });
    });

    await page.goto("/");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
    await expect(page.locator('input[type="email"], form').first()).toBeVisible({ timeout: 15000 });

    const criticalErrors = consoleErrors.filter(
      (error) =>
        !error.includes("/api/") &&
        !error.includes("Failed to fetch") &&
        !error.includes("ERR_CONNECTION_REFUSED") &&
        !error.includes("404")
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test("keeps language switch controls usable", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });

    const englishTab = page.getByRole("tab", { name: /EN/i });
    if (await englishTab.isVisible()) {
      await englishTab.click();
    }

    await expect(page.locator("#root > *").first()).toBeVisible();
  });

  test("loads the standalone agent window route without a blank screen", async ({ page }) => {
    const response = await page.goto("/?window=agent");

    expect(response?.status()).toBeLessThan(400);
    await expect(page.locator("body")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("#root > *").first()).toBeVisible({ timeout: 15000 });
  });

  test("renders the standalone agent workspace chrome in agent window mode", async ({ page }) => {
    await mockAuthenticatedApp(page);

    await page.route("**/api/agent/skills?*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          skills: [
            {
              id: "searchMail",
              name: "Search mail",
              description: "Search messages from the connected mailbox.",
              enabled: true,
            },
          ],
        }),
      });
    });

    await page.goto("/?window=agent");
    await expect(page.getByText("Mail Copilot")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#agent-window-message")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("combobox").first()).toHaveValue("smoke-source");
  });

  test("runs the new-mail processing workbench from the inbox", async ({ page }) => {
    await mockAuthenticatedApp(page);

    await page.goto("/");
    await expect(page.getByText("新邮件处理工作台")).toBeVisible({ timeout: 15000 });
    await page.getByRole("button", { name: "立即处理新邮件" }).click();

    await expect(page.getByText("知识库新增")).toBeVisible();
    await expect(page.getByText("日历候选")).toBeVisible();
    await expect(page.getByRole("link", { name: "Urgent lab deadline" })).toBeVisible();
    await expect(page.getByText("日历确认")).toBeVisible();
    await page.getByRole("button", { name: "全部写入日历" }).click();
    await expect(page.getByText(/已写入日历 1 项/)).toBeVisible();
  });

  test("renders urgent notifications and daily digest in the header center", async ({ page }) => {
    await mockAuthenticatedApp(page);

    await page.goto("/");
    await page.waitForFunction(() =>
      Boolean((window as typeof window & { __mockNotificationStreamUrl?: string }).__mockNotificationStreamUrl?.includes("sourceId=smoke-source"))
    );
    await page.getByRole("button", { name: "通知" }).click();

    await expect(page.getByText("实时已连接")).toBeVisible();
    await expect(page.getByRole("link", { name: "Urgent lab deadline" })).toBeVisible();
    await expect(page.getByText("今天 3 封邮件，1 封紧急重要")).toBeVisible();
    await expect(page.getByText("Project sync meeting · 4月18日 14:00")).toBeVisible();
  });

  test("saves notification preferences from settings", async ({ page }) => {
    await mockAuthenticatedApp(page);

    await page.goto("/");
    await page.getByRole("button", { name: "设置" }).click();

    await expect(page.getByRole("heading", { name: "通知设置" })).toBeVisible();
    await expect(page.getByLabel("摘要时间")).toBeEnabled();
    await page.getByRole("checkbox", { name: "紧急邮件即时提醒" }).uncheck();
    await page.getByLabel("摘要时间").fill("21:30");
    await page.getByLabel("摘要时区").fill("Asia/Tokyo");
    await page.getByRole("button", { name: "保存通知设置" }).click();

    await expect(page.getByText("通知设置已保存。")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "紧急邮件即时提醒" })).not.toBeChecked();
    await expect(page.getByLabel("摘要时间")).toHaveValue("21:30");
    await expect(page.getByLabel("摘要时区")).toHaveValue("Asia/Tokyo");
  });

  test("keeps notification preferences isolated per source", async ({ page }) => {
    await mockAuthenticatedApp(page);

    await page.goto("/");
    await page.getByRole("button", { name: "设置" }).click();

    await expect(page.getByLabel("摘要时间")).toBeEnabled();
    await page.getByRole("checkbox", { name: "紧急邮件即时提醒" }).uncheck();
    await page.getByLabel("摘要时间").fill("21:30");
    await page.getByLabel("摘要时区").fill("Asia/Tokyo");
    await page.getByRole("button", { name: "保存通知设置" }).click();

    await expect(page.getByText("通知设置已保存。")).toBeVisible();
    await expect(page.getByLabel("摘要时间")).toHaveValue("21:30");
    await expect(page.getByLabel("摘要时区")).toHaveValue("Asia/Tokyo");

    await page.getByRole("button", { name: "设为默认" }).click();
    await expect(page.getByRole("checkbox", { name: "紧急邮件即时提醒" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "每日摘要" })).not.toBeChecked();
    await expect
      .poll(() => page.getByLabel("摘要时间").inputValue().catch(() => null))
      .toBe("07:45");
    await expect
      .poll(() => page.getByLabel("摘要时区").inputValue().catch(() => null))
      .toBe("Europe/London");

    await page.getByRole("button", { name: "设为默认" }).click();
    await expect(page.getByRole("checkbox", { name: "紧急邮件即时提醒" })).not.toBeChecked();
    await expect(page.getByRole("checkbox", { name: "每日摘要" })).toBeChecked();
    await expect
      .poll(() => page.getByLabel("摘要时间").inputValue().catch(() => null))
      .toBe("21:30");
    await expect
      .poll(() => page.getByLabel("摘要时区").inputValue().catch(() => null))
      .toBe("Asia/Tokyo");
  });

  test("redirects first-time authenticated users into the tutorial and lets them continue", async ({ page }) => {
    await mockAuthenticatedApp(page, { tutorialCompleted: false });

    await page.goto("/");

    await expect(page.getByRole("heading", { name: "第一次使用，先把邮箱助理点亮" })).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("先绑定邮箱，再选择要归纳的时间范围。")).toBeVisible();
    await page.getByRole("button", { name: "暂时跳过教程" }).click();

    await expect
      .poll(async () => {
        const inboxVisible = await page.getByText("新邮件处理工作台").isVisible().catch(() => false);
        const settingsVisible = await page.getByRole("heading", { name: "通知设置" }).isVisible().catch(() => false);
        const connectGuideVisible = await page.getByRole("heading", { name: "连接你的邮箱" }).isVisible().catch(() => false);
        return inboxVisible || settingsVisible || connectGuideVisible;
      }, { timeout: 15000 })
      .toBe(true);
  });

  test("switches document previews and surfaces artifact read errors", async ({ page }) => {
    await mockAuthenticatedApp(page);
    let mailIdsVersion = 0;

    await page.route("**/api/mail-kb/artifacts/content**", async (route) => {
      const url = new URL(route.request().url());
      const key = url.searchParams.get("key");
      if (key === "scores") {
        await route.fulfill({
          status: 500,
          contentType: "application/json",
          body: JSON.stringify({
            ok: false,
            error: "无法读取知识库文档内容",
          }),
        });
        return;
      }

      if (key === "mailIds") {
        mailIdsVersion += 1;
      }

      const contents: Record<string, string> = {
        mailIds: mailIdsVersion > 2
          ? "# 邮件标识码清单\n\n1. MSG_11\n2. MSG_12\n"
          : mailIdsVersion > 1
            ? "# 邮件标识码清单\n\n1. MSG_9\n2. MSG_10\n"
            : "# 邮件标识码清单\n\n1. MSG_1\n2. MSG_2\n",
        subjects: "# 邮件题目索引\n\n| 标识码 | 题目 |\n| --- | --- |\n| MSG_1 | Tomorrow final report deadline |\n",
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          result: {
            key: key ?? "mailIds",
            label: key === "subjects" ? "邮件题目索引" : key === "scores" ? "邮件评分索引" : "邮件标识码清单",
            path: `/tmp/${key ?? "mailIds"}.md`,
            kind: "markdown",
            content: contents[key ?? "mailIds"] ?? contents.mailIds,
          },
        }),
      });
    });

    await page.goto("/");
    await page.getByRole("button", { name: "知识库" }).click();
    await page.getByRole("button", { name: "文档" }).click();

    await expect(page.getByText("1. MSG_1")).toBeVisible();
    await page.getByRole("main").getByRole("button", { name: "刷新", exact: true }).click();
    await expect(page.getByText("1. MSG_9")).toBeVisible();
    await page.getByRole("button", { name: "刷新文档" }).click();
    await expect(page.getByText("1. MSG_11")).toBeVisible();
    await page.getByRole("button", { name: /邮件题目索引/ }).click();
    await expect(page.getByText("Tomorrow final report deadline")).toBeVisible();
    await page.getByRole("button", { name: /邮件评分索引/ }).click();
    await expect(page.getByText("无法读取知识库文档内容")).toBeVisible();
    await expect(page.getByText("Tomorrow final report deadline")).not.toBeVisible();
    await expect(page.getByText("该文档尚未生成。完成旧邮件归纳后，这里会显示本地文件内容。")).not.toBeVisible();
    await expect(page.getByText("文档读取失败，请重试。")).toBeVisible();
  });

  test("keeps the newer document selected during tab-local refresh", async ({ page }) => {
    await mockAuthenticatedApp(page);
    let mailIdsVersion = 0;

    await page.route("**/api/mail-kb/artifacts/content**", async (route) => {
      const url = new URL(route.request().url());
      const key = url.searchParams.get("key");
      if (key === "mailIds") {
        mailIdsVersion += 1;
        if (mailIdsVersion > 1) {
          await new Promise((resolve) => setTimeout(resolve, 250));
        }
      }

      const contentByKey: Record<string, string> = {
        mailIds: mailIdsVersion > 1
          ? "# 邮件标识码清单\n\n1. MSG_99\n2. MSG_100\n"
          : "# 邮件标识码清单\n\n1. MSG_1\n2. MSG_2\n",
        subjects: "# 邮件题目索引\n\n| 标识码 | 题目 |\n| --- | --- |\n| MSG_1 | Tomorrow final report deadline |\n",
      };

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          result: {
            key: key ?? "mailIds",
            label: key === "subjects" ? "邮件题目索引" : "邮件标识码清单",
            path: `/tmp/${key ?? "mailIds"}.md`,
            kind: "markdown",
            content: contentByKey[key ?? "mailIds"] ?? contentByKey.mailIds,
          },
        }),
      });
    });

    await page.goto("/");
    await page.getByRole("button", { name: "知识库" }).click();
    await page.getByRole("button", { name: "文档" }).click();

    await expect(page.getByText("1. MSG_1")).toBeVisible();
    await page.getByRole("button", { name: "刷新文档" }).click();
    await page.getByRole("button", { name: /邮件题目索引/ }).click();
    await expect(page.getByText("Tomorrow final report deadline")).toBeVisible();
    await page.waitForTimeout(400);
    await expect(page.getByText("MSG_99")).not.toBeVisible();
  });

  test("keeps the latest artifact list after overlapping document refreshes", async ({ page }) => {
    await mockAuthenticatedApp(page);
    let artifactsRequestCount = 0;
    let refreshRaceStartCount: number | null = null;

    await page.route("**/api/mail-kb/artifacts**", async (route) => {
      const url = new URL(route.request().url());
      const sourceId = url.searchParams.get("sourceId");
      expect(sourceId).toBe("smoke-source");
      artifactsRequestCount += 1;

      const refreshOffset =
        refreshRaceStartCount === null ? 0 : artifactsRequestCount - refreshRaceStartCount;
      if (refreshOffset === 1) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      const initialArtifacts = [
        { key: "mailIds", label: "邮件标识码清单", path: "/tmp/mail-ids.md" },
        { key: "subjects", label: "邮件题目索引", path: "/tmp/mail-subject-index.md" },
      ];
      const staleRefreshArtifacts = [
        { key: "mailIds", label: "邮件标识码清单", path: "/tmp/mail-ids.md" },
        { key: "scores", label: "邮件评分索引", path: "/tmp/mail-score-index.md" },
      ];
      const latestRefreshArtifacts = [
        { key: "mailIds", label: "邮件标识码清单", path: "/tmp/mail-ids.md" },
        { key: "events", label: "事件聚类索引", path: "/tmp/event-clusters.md" },
      ];
      const artifacts =
        refreshRaceStartCount === null
          ? initialArtifacts
          : refreshOffset === 1
            ? staleRefreshArtifacts
            : latestRefreshArtifacts;

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          result: {
            artifacts,
            baselineStatus: {
              backfillCompleted: false,
            },
          },
        }),
      });
    });

    await page.route("**/api/mail-kb/artifacts/content**", async (route) => {
      const url = new URL(route.request().url());
      const key = url.searchParams.get("key");
      const sourceId = url.searchParams.get("sourceId");
      expect(sourceId).toBe("smoke-source");
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          result: {
            key: key ?? "mailIds",
            label: key === "events" ? "事件聚类索引" : key === "scores" ? "邮件评分索引" : "邮件标识码清单",
            path: `/tmp/${key ?? "mailIds"}.md`,
            kind: "markdown",
            content:
              key === "events"
                ? "# 事件聚类索引\n\n## EVT_1 | Final Report\n"
                : key === "scores"
                  ? "# 邮件评分索引\n\n| 标识码 | 重要性 |\n| --- | --- |\n| MSG_1 | 0.8/1 |\n"
                  : "# 邮件标识码清单\n\n1. MSG_1\n",
          },
        }),
      });
    });

    await page.goto("/");
    await page.getByRole("button", { name: "知识库" }).click();
    await page.getByRole("button", { name: "文档" }).click();

    await expect(page.getByRole("button", { name: /邮件题目索引/ })).toBeVisible();
    refreshRaceStartCount = artifactsRequestCount;
    await page.getByRole("button", { name: "刷新文档" }).click();
    await page.getByRole("main").getByRole("button", { name: "刷新", exact: true }).click();

    await expect(page.getByRole("button", { name: /事件聚类索引/ })).toBeVisible();
    await page.waitForTimeout(400);
    await expect(page.getByRole("button", { name: /邮件评分索引/ })).not.toBeVisible();
  });

  test("renders the Eisenhower matrix in the knowledge-base overview", async ({ page }) => {
    await mockAuthenticatedApp(page);

    await page.route("**/api/mail/inbox**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          result: {
            generatedAt: "2026-04-17T00:00:00.000Z",
            total: 0,
            items: [],
          },
        }),
      });
    });

    await page.route("**/api/mail-kb/stats**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          result: {
            stats: {
              totalMails: 5,
              totalEvents: 2,
              totalPersons: 3,
              processedAt: "2026-04-17T00:00:00.000Z",
              dateRange: {
                start: "2026-03-20T00:00:00.000Z",
                end: "2026-04-17T00:00:00.000Z",
              },
              quadrantDistribution: {
                unprocessed: 1,
                urgent_important: 1,
                not_urgent_important: 1,
                urgent_not_important: 1,
                not_urgent_not_important: 1,
              },
            },
          },
        }),
      });
    });

    await page.route("**/api/mail-kb/mails**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          result: {
            mails: [
              {
                mailId: "MSG_1",
                rawId: "raw-1",
                subject: "Tomorrow final report deadline",
                personId: "PER_1",
                eventId: "EVT_1",
                importanceScore: 0.95,
                urgencyScore: 0.98,
                scoreScale: "ratio",
                quadrant: "urgent_important",
                summary: "Need to submit the final report by tomorrow.",
                receivedAt: "2026-04-16T09:00:00.000Z",
                processedAt: "2026-04-17T00:00:00.000Z",
              },
              {
                mailId: "MSG_2",
                rawId: "raw-2",
                subject: "Advisor feedback for next month plan",
                personId: "PER_2",
                eventId: "EVT_2",
                importanceScore: 0.91,
                urgencyScore: 0.35,
                scoreScale: "ratio",
                quadrant: "not_urgent_important",
                summary: "Important long-term planning feedback from advisor.",
                receivedAt: "2026-04-14T09:00:00.000Z",
                processedAt: "2026-04-17T00:00:00.000Z",
              },
              {
                mailId: "MSG_3",
                rawId: "raw-3",
                subject: "Reminder to update club roster today",
                personId: "PER_3",
                eventId: null,
                importanceScore: 0.3,
                urgencyScore: 0.88,
                scoreScale: "ratio",
                quadrant: "urgent_not_important",
                summary: "Needs quick handling but is not central to current priorities.",
                receivedAt: "2026-04-15T09:00:00.000Z",
                processedAt: "2026-04-17T00:00:00.000Z",
              },
              {
                mailId: "MSG_4",
                rawId: "raw-4",
                subject: "Newsletter roundup",
                personId: "PER_3",
                eventId: null,
                importanceScore: 0.12,
                urgencyScore: 0.15,
                scoreScale: "ratio",
                quadrant: "not_urgent_not_important",
                summary: "Background reading with low current relevance.",
                receivedAt: "2026-04-10T09:00:00.000Z",
                processedAt: "2026-04-17T00:00:00.000Z",
              },
              {
                mailId: "MSG_5",
                rawId: "raw-5",
                subject: "Legacy scoring import",
                personId: "PER_3",
                eventId: null,
                importanceScore: 8,
                urgencyScore: 1,
                scoreScale: "ten",
                quadrant: "legacy_unknown",
                summary: "A migrated record with a legacy score scale and unknown quadrant.",
                receivedAt: "2026-04-12T09:00:00.000Z",
                processedAt: "2026-04-17T00:00:00.000Z",
              },
            ],
            total: 5,
            limit: 50,
            offset: 0,
          },
        }),
      });
    });

    await page.route("**/api/mail-kb/events**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          result: {
            events: [
              {
                eventId: "EVT_1",
                name: "Final Report",
                summary: "Final submission event",
                keyInfo: ["Due tomorrow"],
                relatedMailIds: ["MSG_1"],
                lastUpdated: "2026-04-17T00:00:00.000Z",
                tags: ["ddl"],
              },
              {
                eventId: "EVT_2",
                name: "Next Month Plan",
                summary: "Advisor planning thread",
                keyInfo: ["Planning"],
                relatedMailIds: ["MSG_2"],
                lastUpdated: "2026-04-17T00:00:00.000Z",
                tags: ["plan"],
              },
            ],
          },
        }),
      });
    });

    await page.route("**/api/mail-kb/persons**", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          ok: true,
          result: {
            persons: [
              {
                personId: "PER_1",
                email: "pm@example.com",
                name: "PM Zhang",
                profile: "Project manager",
                role: "课程负责人",
                importance: 0.95,
                recentInteractions: 4,
                lastUpdated: "2026-04-17T00:00:00.000Z",
              },
              {
                personId: "PER_2",
                email: "advisor@example.com",
                name: "Advisor Li",
                profile: "Academic advisor",
                role: "导师",
                importance: 0.91,
                recentInteractions: 2,
                lastUpdated: "2026-04-17T00:00:00.000Z",
              },
              {
                personId: "PER_3",
                email: "notice@example.com",
                name: "Student Office",
                profile: "General notices",
                role: "通知",
                importance: 0.3,
                recentInteractions: 5,
                lastUpdated: "2026-04-17T00:00:00.000Z",
              },
            ],
          },
        }),
      });
    });

    await page.goto("/");
    await page.getByRole("button", { name: "知识库" }).click();

    await expect(page.getByText("按重要度、紧急度与处理状态排布邮件")).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole("button", { name: /Tomorrow final report deadline/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Advisor feedback for next month plan/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Reminder to update club roster today/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Legacy scoring import/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Newsletter roundup/ })).toBeVisible();

    await page.getByRole("button", { name: /Tomorrow final report deadline/ }).click();
    await expect(page.getByRole("heading", { name: "Tomorrow final report deadline" })).toBeVisible();
    await page.getByRole("button", { name: /Legacy scoring import/ }).click();
    await expect(page.getByText("8/10")).toBeVisible();
    await expect(page.getByText("1/10")).toBeVisible();

    await page.getByRole("button", { name: "文档" }).click();
    await expect(page.getByRole("heading", { name: "本地总结文档" })).toBeVisible();
    await expect(page.getByRole("button", { name: /邮件标识码清单/ })).toBeVisible();
    await expect(page.getByText("MSG_1")).toBeVisible();
  });
});
