import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { resolve, join } from "node:path";

const outDir = resolve(".local/acceptance/screenshots");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath:
    process.env.SOLAIR_CHROME ||
    "/home/ralphandreicastillo326/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome",
  args: ["--no-sandbox"],
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await page.goto("http://127.0.0.1:4781", { waitUntil: "networkidle" });

  // 1. Chat Desktop View
  await page.waitForSelector(".composer");
  await page.screenshot({ path: join(outDir, "1-chat-desktop.png"), fullPage: false });
  console.log("Captured 1-chat-desktop.png");

  // 2. Open Equations Modal
  await page.locator(".topbar-eq-btn").click();
  await page.waitForSelector(".modal-content");
  await page.screenshot({ path: join(outDir, "2-equations-modal.png"), fullPage: false });
  console.log("Captured 2-equations-modal.png");

  // Close Equations Modal via Escape key (testing shortcut!)
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // 3. Open Print Readiness Modal
  await page.locator(".topbar-print-btn").click();
  await page.waitForSelector(".modal-content.large");
  await page.screenshot({ path: join(outDir, "3-print-readiness-modal.png"), fullPage: false });
  console.log("Captured 3-print-readiness-modal.png");

  // Close Print Readiness Modal via Escape key
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // 4. Review Changes View
  await page.getByRole("button", { name: /Review changes/ }).click();
  await page.waitForSelector(".review-grid");
  if (await page.locator(".job-item").count()) {
    await page.locator(".job-item").first().click();
    await page.waitForTimeout(300);
  }
  await page.screenshot({ path: join(outDir, "4-review-changes.png"), fullPage: false });
  console.log("Captured 4-review-changes.png");

  // 5. Team Workspace & Authentication View
  await page.getByRole("button", { name: /Team & Access/ }).click();
  await page.waitForSelector(".team-workspace-view");
  await page.screenshot({ path: join(outDir, "5-team-workspace.png"), fullPage: false });
  console.log("Captured 5-team-workspace.png");

  // 6. Backend System Diagnostics View
  await page.getByRole("button", { name: /System Diagnostics/ }).click();
  await page.waitForSelector(".diagnostics-view");
  await page.waitForTimeout(1000); // allow initial sweep to complete
  await page.screenshot({ path: join(outDir, "6-backend-diagnostics.png"), fullPage: false });
  console.log("Captured 6-backend-diagnostics.png");

  // 7. Hierarchical Paragraph Selection in Chat
  await page.getByRole("button", { name: /Manuscript chat/ }).click();
  await page.waitForSelector(".composer");
  // Click on "🎯 Target Paragraph" scope pill
  await page.getByRole("button", { name: /Target Paragraph/ }).click();
  await page.waitForSelector(".scope-selectors-grid");

  // Select Chapter 1 by label
  await page.selectOption("#para-chapter-select", { label: "Chapter 1 — THE PROBLEM AND ITS SETTING" });
  await page.waitForTimeout(300);

  // Select Introduction section by label
  await page.selectOption("#para-section-select", { label: "Introduction" });
  await page.waitForTimeout(300);

  // Select first available paragraph
  await page.selectOption("#para-target-select", { index: 1 });
  await page.waitForTimeout(300);

  // Scroll into view so all 3 dropdowns and the targeted paragraph card are visible
  await page.locator(".targeted-paragraph-card").scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);

  await page.screenshot({ path: join(outDir, "7-hierarchical-paragraph-selection.png"), fullPage: false });
  console.log("Captured 7-hierarchical-paragraph-selection.png");

  // 8. Mobile Responsive View
  const mobilePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mobilePage.goto("http://127.0.0.1:4781", { waitUntil: "networkidle" });
  await mobilePage.waitForSelector(".composer");
  await mobilePage.screenshot({ path: join(outDir, "8-mobile-view.png"), fullPage: false });
  console.log("Captured 8-mobile-view.png");
  await mobilePage.close();

  // 9. Quick Account Switcher & ChatGPT Connection Modal
  await page.locator(".account-pill-btn").click();
  await page.waitForSelector(".account-modal-content");
  await page.screenshot({ path: join(outDir, "9-quick-account-modal.png"), fullPage: false });
  console.log("Captured 9-quick-account-modal.png");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);

  // 10. Real Instrument Subsection Targeting (Chapter 3 -> Instruments -> ISO/IEC 25010)
  // Ensure we are in Manuscript chat
  await page.getByRole("button", { name: /Manuscript chat/ }).click();
  await page.waitForSelector(".composer");
  await page.getByRole("button", { name: /Target Paragraph/ }).click();
  await page.waitForSelector(".scope-selectors-grid");

  // Select Chapter 3
  await page.selectOption("#para-chapter-select", { label: "Chapter 3 — METHODOLOGY" });
  await page.waitForTimeout(300);

  // Select Description of Research Instrument Used
  await page.selectOption("#para-section-select", { label: "Description of Research Instrument Used" });
  await page.waitForTimeout(300);

  // Select Level 3 Subsection: ISO/IEC 25010 Evaluation Questionnaire
  await page.selectOption("#para-subsection-select", { label: "↳ ISO/IEC 25010 Evaluation Questionnaire" });
  await page.waitForTimeout(300);

  // Select first paragraph in this subsection
  await page.selectOption("#para-target-select", { index: 1 });
  await page.waitForTimeout(300);

  await page.locator(".targeted-paragraph-card").scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);

  await page.screenshot({ path: join(outDir, "10-subsection-targeting.png"), fullPage: false });
  console.log("Captured 10-subsection-targeting.png");

  // Copy all screenshots to artifact directory
  const artifactDir = "/home/ralphandreicastillo326/.gemini/antigravity-cli/brain/418a4353-f217-484c-87c1-ffade858b6dc/screenshots";
  mkdirSync(artifactDir, { recursive: true });
  const { copyFileSync, readdirSync } = await import("node:fs");
  for (const file of readdirSync(outDir)) {
    if (file.endsWith(".png")) {
      copyFileSync(join(outDir, file), join(artifactDir, file));
    }
  }
  console.log("All screenshots copied to artifact directory:", artifactDir);
} finally {
  await browser.close();
}
