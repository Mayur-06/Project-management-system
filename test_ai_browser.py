import asyncio
import os
from playwright.async_api import async_playwright

ARTIFACT_DIR = r"C:\Users\ktmay\.gemini\antigravity-ide\brain\de56e761-1dd0-4ebd-be65-570cb5673aa7"

async def wait_for_stream_complete(page, timeout_ms=45000):
    """Waits for the AI response streaming to finish and input to become ready."""
    await page.wait_for_timeout(1500)
    stop_btn = page.locator('button[title="Stop streaming"]')
    # Wait until stop streaming button is detached/hidden
    try:
        await stop_btn.wait_for(state="hidden", timeout=timeout_ms)
    except Exception:
        pass
    # Verify send button is visible again
    send_btn = page.locator('button[title="Send message"], button:has(svg.lucide-arrow-up)')
    await send_btn.first.wait_for(state="visible", timeout=timeout_ms)
    await page.wait_for_timeout(1000)

async def run_clean_suite():
    print("=== Starting Playwright AI Browser Test Suite ===")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 800})
        page = await context.new_page()

        # Step 1: Login
        print("1. Logging in as alex@acme.inc...")
        await page.goto("http://localhost:3000/login", wait_until="networkidle")
        await page.fill('input[type="email"]', "alex@acme.inc")
        await page.fill('input[type="password"]', "password123")
        await page.click('button[type="submit"]')
        await page.wait_for_url("**/issues**", timeout=15000)
        print("   Logged in successfully.")

        # Step 2: Open AI page
        print("2. Navigating to AI workspace (/acme/ai)...")
        await page.goto("http://localhost:3000/acme/ai", wait_until="networkidle")
        await page.wait_for_selector('textarea', timeout=10000)
        await page.wait_for_timeout(1000)

        # Step 3: Test Question 1 (Workspace search & issue synthesis)
        print("3. Submitting Test 1: 'List all issues in team ENG'...")
        textarea = page.locator('textarea').first
        await textarea.click()
        await textarea.fill("List all issues in team ENG")
        await page.wait_for_timeout(300)
        
        send_btn = page.locator('button[title="Send message"], button:has(svg.lucide-arrow-up)').first
        if await send_btn.is_visible() and not await send_btn.is_disabled():
            await send_btn.click()
        else:
            await textarea.press("Enter")

        print("   Waiting for Test 1 streaming response to finish...")
        await wait_for_stream_complete(page, timeout_ms=45000)
        test1_path = os.path.join(ARTIFACT_DIR, "browser_ai_test1_search_response.png")
        await page.screenshot(path=test1_path)
        print(f"   Saved {test1_path}")

        # Step 4: Test Question 2 (HITL Issue Creation)
        print("4. Submitting Test 2: 'Create a high priority bug titled Redis connection pool timeout for team ENG'...")
        bottom_textarea = page.locator('textarea').last
        await bottom_textarea.click()
        await bottom_textarea.fill("Create a high priority bug titled Redis connection pool timeout for team ENG")
        await page.wait_for_timeout(500)

        send_btn2 = page.locator('button[title="Send message"]').last
        if await send_btn2.is_visible() and not await send_btn2.is_disabled():
            await send_btn2.click()
        else:
            await bottom_textarea.press("Enter")

        print("   Waiting for Draft Issue Proposal Card to appear...")
        draft_card = page.locator('text="Draft Issue Proposal"').first
        await draft_card.wait_for(state="visible", timeout=35000)
        await page.wait_for_timeout(1500)
        test2_draft_path = os.path.join(ARTIFACT_DIR, "browser_ai_test2_draft_card.png")
        await page.screenshot(path=test2_draft_path)
        print(f"   Saved {test2_draft_path}")

        # Step 5: Confirm and Create Issue
        print("5. Confirming draft issue creation...")
        confirm_btn = page.locator('button:has-text("Confirm & Create")').first
        await confirm_btn.click()
        
        print("   Waiting for creation confirmation and View Issue button...")
        view_btn = page.locator('button:has-text("View ENG-")').first
        await view_btn.wait_for(state="visible", timeout=25000)
        await page.wait_for_timeout(1500)
        test2_confirmed_path = os.path.join(ARTIFACT_DIR, "browser_ai_test2_confirmed.png")
        await page.screenshot(path=test2_confirmed_path)
        print(f"   Saved {test2_confirmed_path}")

        # Step 6: View Created Issue Details
        print("6. Clicking deep-link button to view created issue...")
        view_btn = page.locator('button:has-text("View ENG-")').first
        if await view_btn.is_visible():
            await view_btn.click()
            await page.wait_for_timeout(3000)
            test2_details_path = os.path.join(ARTIFACT_DIR, "browser_ai_test2_issue_details.png")
            await page.screenshot(path=test2_details_path)
            print(f"   Saved {test2_details_path}")
            await page.goto("http://localhost:3000/acme/ai", wait_until="networkidle")
            await page.wait_for_timeout(1000)

        # Step 7: Technical Architecture & Dropdown History
        print("7. Testing Thread Switching & Technical Question...")
        dropdown_btn = page.locator('[data-testid="ai-conversation-dropdown"]').first
        await dropdown_btn.click()
        await page.wait_for_timeout(600)
        await page.locator('text="Start New Chat"').first.click()
        await page.wait_for_timeout(1500)

        tech_area = page.locator('textarea').first
        await tech_area.click()
        await tech_area.fill("How do I optimize PostgreSQL query performance for vector similarity search with pgvector?")
        await page.wait_for_timeout(400)
        send_btn3 = page.locator('button[title="Send message"]').first
        if await send_btn3.is_visible() and not await send_btn3.is_disabled():
            await send_btn3.click()
        else:
            await tech_area.press("Enter")

        print("   Waiting for technical explanation streaming to finish...")
        await wait_for_stream_complete(page, timeout_ms=45000)
        test3_path = os.path.join(ARTIFACT_DIR, "browser_ai_test3_tech_explanation.png")
        await page.screenshot(path=test3_path)
        print(f"   Saved {test3_path}")

        # Step 8: Final Threads Dropdown Verification
        print("8. Verifying Thread Switcher with saved conversations...")
        dropdown_btn2 = page.locator('[data-testid="ai-conversation-dropdown"]').first
        await dropdown_btn2.click()
        await page.wait_for_timeout(1000)
        threads_path = os.path.join(ARTIFACT_DIR, "browser_ai_threads_list_populated.png")
        await page.screenshot(path=threads_path)
        print(f"   Saved {threads_path}")

        await browser.close()
        print("=== All Test Cases Completed Cleanly with Exit Code 0! ===")

if __name__ == "__main__":
    asyncio.run(run_clean_suite())
