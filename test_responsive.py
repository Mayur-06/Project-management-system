import asyncio
import os
import json
from playwright.async_api import async_playwright

OUTPUT_DIR = r"C:\Users\ktmay\.gemini\antigravity-ide\brain\c6c7ef5f-08b3-499b-9cc6-3ea8af97309d\responsive_tests"
os.makedirs(OUTPUT_DIR, exist_ok=True)

VIEWPORTS = [
    {"name": "mobile_sm", "width": 375, "height": 667, "device": "iPhone SE"},
    {"name": "mobile_md", "width": 390, "height": 844, "device": "iPhone 14"},
    {"name": "tablet_md", "width": 768, "height": 1024, "device": "iPad Portrait"},
    {"name": "tablet_lg", "width": 1024, "height": 768, "device": "iPad Landscape"},
    {"name": "desktop_lg", "width": 1440, "height": 900, "device": "Desktop HD"},
]

ROUTES = [
    {"name": "login", "url": "http://localhost:3000/login", "auth": False},
    {"name": "issues_board", "url": "http://localhost:3000/acme/eng/issues", "auth": True},
    {"name": "issues_list", "url": "http://localhost:3000/acme/eng/issues", "auth": True, "action": "switch_to_list"},
    {"name": "ai_chat", "url": "http://localhost:3000/acme/ai", "auth": True},
    {"name": "inbox", "url": "http://localhost:3000/acme/inbox", "auth": True},
    {"name": "settings", "url": "http://localhost:3000/acme/settings/workspace", "auth": True},
]

async def check_overflow_and_metrics(page):
    """Checks for horizontal overflow and element clipping."""
    metrics = await page.evaluate('''() => {
        const docElem = document.documentElement;
        const body = document.body;
        
        const scrollWidth = Math.max(docElem.scrollWidth, body ? body.scrollWidth : 0);
        const clientWidth = docElem.clientWidth;
        const hasHorizontalOverflow = scrollWidth > clientWidth;
        
        // Find elements wider than clientWidth
        const overflowingElements = [];
        const allElements = document.querySelectorAll('*');
        for (const el of allElements) {
            const rect = el.getBoundingClientRect();
            if (rect.right > clientWidth + 2 || rect.left < -2) {
                // Ignore elements with display: none or zero dimensions or specific popovers
                if (rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none' && window.getComputedStyle(el).visibility !== 'hidden') {
                    const tag = el.tagName.toLowerCase();
                    const cls = (el.className && typeof el.className === 'string') ? el.className.split(' ').slice(0, 3).join('.') : '';
                    overflowingElements.push({
                        selector: `${tag}.${cls}`,
                        left: Math.round(rect.left),
                        right: Math.round(rect.right),
                        width: Math.round(rect.width),
                    });
                    if (overflowingElements.length >= 10) break;
                }
            }
        }
        
        return {
            clientWidth,
            scrollWidth,
            overflowDiff: scrollWidth - clientWidth,
            hasHorizontalOverflow,
            overflowingElements,
        };
    }''')
    return metrics

async def run_tests():
    report = []
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        
        # First, log in once and get storage state
        print("Logging in to obtain session...")
        login_context = await browser.new_context(viewport={"width": 1280, "height": 800})
        login_page = await login_context.new_page()
        await login_page.goto("http://localhost:3000/login", wait_until="networkidle")
        await login_page.fill('input[type="email"]', 'alex@acme.inc')
        await login_page.fill('input[type="password"]', 'password123')
        await login_page.click('button[type="submit"]')
        await login_page.wait_for_url("**/issues**", timeout=15000)
        await login_page.wait_for_timeout(2000)
        
        storage_state = await login_context.storage_state()
        await login_context.close()
        print("Obtained authenticated storage state.")
        
        for vp in VIEWPORTS:
            vp_report = {"viewport": vp, "results": []}
            print(f"\n--- Testing Viewport: {vp['name']} ({vp['width']}x{vp['height']}) ---")
            
            context = await browser.new_context(
                viewport={"width": vp["width"], "height": vp["height"]},
                storage_state=storage_state
            )
            page = await context.new_page()
            
            for route in ROUTES:
                print(f"Testing route: {route['name']} ({route['url']})")
                try:
                    await page.goto(route["url"], wait_until="networkidle", timeout=15000)
                    await page.wait_for_timeout(1500)
                    
                    if route.get("action") == "switch_to_list":
                        # Click list view button
                        list_btn = page.locator('button[title="List View"]')
                        if await list_btn.count() > 0:
                            await list_btn.click()
                            await page.wait_for_timeout(1000)

                    # Check create issue modal responsiveness if on issues board
                    modal_metrics = None
                    if route["name"] == "issues_board":
                        # Take screenshot of board first
                        shot_path = os.path.join(OUTPUT_DIR, f"{vp['name']}_{route['name']}.png")
                        await page.screenshot(path=shot_path, full_page=False)
                        
                        # Open new issue modal
                        new_issue_btn = page.locator('button:has-text("New Issue")').first
                        if await new_issue_btn.count() > 0 and await new_issue_btn.is_visible():
                            await new_issue_btn.click()
                            await page.wait_for_timeout(1000)
                            modal_shot = os.path.join(OUTPUT_DIR, f"{vp['name']}_modal_new_issue.png")
                            await page.screenshot(path=modal_shot)
                            modal_metrics = await check_overflow_and_metrics(page)
                            # Close modal
                            await page.keyboard.press("Escape")
                            await page.wait_for_timeout(500)
                    
                    screenshot_name = f"{vp['name']}_{route['name']}.png"
                    screenshot_path = os.path.join(OUTPUT_DIR, screenshot_name)
                    if not (route["name"] == "issues_board"):
                        await page.screenshot(path=screenshot_path, full_page=False)
                    
                    metrics = await check_overflow_and_metrics(page)
                    
                    # Check sidebar visibility
                    sidebar_visible = False
                    sidebar = page.locator('aside')
                    if await sidebar.count() > 0:
                        sidebar_visible = await sidebar.first.is_visible()
                        sidebar_box = await sidebar.first.bounding_box()
                    else:
                        sidebar_box = None
                        
                    result = {
                        "route": route["name"],
                        "url": route["url"],
                        "screenshot": screenshot_name,
                        "metrics": metrics,
                        "sidebar_visible": sidebar_visible,
                        "sidebar_box": sidebar_box,
                        "modal_metrics": modal_metrics,
                    }
                    vp_report["results"].append(result)
                    print(f"  Result: clientW={metrics['clientWidth']}, scrollW={metrics['scrollWidth']}, overflow={metrics['hasHorizontalOverflow']}")
                except Exception as ex:
                    print(f"  Error on {route['name']}: {ex}")
                    vp_report["results"].append({
                        "route": route["name"],
                        "error": str(ex)
                    })
            
            await context.close()
            report.append(vp_report)
            
        await browser.close()
        
    with open(os.path.join(OUTPUT_DIR, "responsiveness_report.json"), "w") as f:
        json.dump(report, f, indent=2)
    print("\nCompleted responsive browser tests! Report saved.")

if __name__ == "__main__":
    asyncio.run(run_tests())
