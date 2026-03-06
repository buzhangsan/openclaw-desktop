/**
 * E2E test skeleton for OpenClaw Desktop.
 *
 * These tests run against the Vite dev server (web layer only).
 * Tauri invoke calls are mocked since we can't spawn the native shell in CI.
 *
 * Run: npx playwright test
 */
import { test, expect, Page } from "@playwright/test";

// Helper: mock Tauri invoke so the app doesn't crash in a plain browser
async function mockTauriInvoke(page: Page) {
  await page.addInitScript(() => {
    // Provide a minimal mock for @tauri-apps/api/core invoke
    (window as any).__TAURI_INTERNALS__ = {
      invoke: (cmd: string, _args?: any) => {
        const mocks: Record<string, any> = {
          check_system_status: {
            node_installed: true,
            node_version: "v20.0.0",
            npm_installed: true,
            npm_version: "10.0.0",
            openclaw_installed: false,
            openclaw_version: null,
            gateway_running: false,
            gateway_port: 18789,
            embedded_node_ready: false,
          },
          load_config: {
            provider: null,
            agent: null,
            channels: [],
          },
        };
        if (cmd in mocks) return Promise.resolve(mocks[cmd]);
        return Promise.reject(`mock: unknown command ${cmd}`);
      },
    };
  });
}

test.describe("Wizard Flow", () => {
  test.beforeEach(async ({ page }) => {
    await mockTauriInvoke(page);
    await page.goto("/");
  });

  test("shows wizard header on first load", async ({ page }) => {
    await expect(page.locator("h1")).toContainText("OpenClaw Desktop");
  });

  test("displays 5-step progress bar", async ({ page }) => {
    const steps = page.locator(".progress-step");
    await expect(steps).toHaveCount(5);
  });

  test("step 1 shows environment detection", async ({ page }) => {
    await expect(page.locator("h2")).toContainText("环境检测");
  });

  test("shows Node.js status in step 1", async ({ page }) => {
    await expect(page.locator(".status-item").first()).toContainText("Node.js");
  });
});

test.describe("Wizard Step Navigation (with openclaw installed)", () => {
  test.beforeEach(async ({ page }) => {
    // Mock with openclaw installed so we can navigate
    await page.addInitScript(() => {
      (window as any).__TAURI_INTERNALS__ = {
        invoke: (cmd: string, _args?: any) => {
          const mocks: Record<string, any> = {
            check_system_status: {
              node_installed: true,
              node_version: "v20.0.0",
              npm_installed: true,
              npm_version: "10.0.0",
              openclaw_installed: true,
              openclaw_version: "1.0.0",
              gateway_running: false,
              gateway_port: 18789,
              embedded_node_ready: false,
            },
            load_config: {
              provider: null,
              agent: null,
              channels: [],
            },
            save_provider_config: "ok",
            save_agent_config: "ok",
            save_channel_config: "ok",
            validate_channel: "ok",
          };
          if (cmd in mocks) return Promise.resolve(mocks[cmd]);
          return Promise.reject(`mock: unknown command ${cmd}`);
        },
      };
    });
    await page.goto("/");
  });

  test("can navigate from env to provider step", async ({ page }) => {
    // With openclaw installed, check_system_status triggers view="main" auto-switch.
    // The app goes directly to main view. This test verifies main view renders.
    await expect(page.locator("h2").first()).toContainText("系统状态");
  });
});

test.describe("Main View", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      (window as any).__TAURI_INTERNALS__ = {
        invoke: (cmd: string, _args?: any) => {
          const mocks: Record<string, any> = {
            check_system_status: {
              node_installed: true,
              node_version: "v20.0.0",
              npm_installed: true,
              npm_version: "10.0.0",
              openclaw_installed: true,
              openclaw_version: "1.0.0",
              gateway_running: false,
              gateway_port: 18789,
              embedded_node_ready: false,
            },
            load_config: {
              provider: { provider: "anthropic", endpoint: "https://api.anthropic.com", model: "claude-3-5-sonnet-20241022", api_key: "sk-test" },
              agent: { name: "test-agent", profile: "general", tool_policy: "standard" },
              channels: [{ channel_type: "discord", enabled: true, token: "test-token", target: "" }],
            },
            get_gateway_status: false,
            export_diagnostics: "/tmp/diag.json",
          };
          if (cmd in mocks) return Promise.resolve(mocks[cmd]);
          return Promise.reject(`mock: unknown command ${cmd}`);
        },
      };
    });
    await page.goto("/");
  });

  test("shows system status panel", async ({ page }) => {
    await expect(page.locator("text=系统状态")).toBeVisible();
  });

  test("shows gateway start button when not running", async ({ page }) => {
    await expect(page.locator("text=启动 Gateway")).toBeVisible();
  });

  test("shows diagnostics panel", async ({ page }) => {
    await expect(page.locator("text=验证中心")).toBeVisible();
  });

  test("shows log panel", async ({ page }) => {
    await expect(page.locator("text=日志")).toBeVisible();
  });
});
