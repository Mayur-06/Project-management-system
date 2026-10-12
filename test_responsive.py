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
    {"name": "login", "url": "http://localhost:3000/login"},
    {"name": "issues_board", "url": "http://localhost:3000/acme/eng/issues"},
    {"name": "issues_list", "url": "http://localhost:3000/acme/eng/issues", "action": "switch_to_list"},
    {"name": "issue_detail", "url": "http://localhost:3000/acme/eng/issues/ENG-1"},
    {"name": "ai_chat", "url": "http://localhost:3000/acme/ai"},
    {"name": "inbox", "url": "http://localhost:3000/acme/inbox"},
    {"name": "settings_workspace", "url": "http://localhost:3000/acme/settings/workspace"},
    {"name": "settings_members", "url": "http://localhost:3000/acme/settings/members"},
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
            // Ignore script, style, portals, and SVG definitions
            if (['SCRIPT', 'STYLE', 'NEXTJS-PORTAL'].includes(el.tagName)) continue;
            
            const rect = el.getBoundingClientRect();
            if (rect.right > clientWidth + 2 || rect.left < -2) {
                if (rect.width > 0 && rect.height > 0 && window.getComputedStyle(el).display !== 'none' && window.getComputedStyle(el).visibility !== 'hidden') {
                    const tag = el.tagName.toLowerCase();
                    const cls = (el.className && typeof el.className === 'string') ? el.className.split(' ').slice(0, 3).join('.') : '';
                    overflowingElements.push({
                        selector: `${tag}.${cls}`,
                        left: Math.round(rect.left),
                        right: Math.round(rect.right),
                        width: Math.round(rect.width),
                    });
                    if (overflowingElements.length >= 5) break;
                }
            }
        }
        
        return {
            clientWidth,
            scrollWidth,
            overflowDiff: Math.max(0, scrollWidth - clientWidth),
            hasHorizontalOverflow,
            overflowingElements,
        };
    }''')
    return metrics

async def run_tests():
    report = []
    
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        
        # 1. Log in once to obtain session state
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
            is_mobile = vp["width"] < 768
            print(f"\n==================================================")
            print(f"Testing Viewport: {vp['name']} ({vp['width']}x{vp['height']}) - {vp['device']}")
            print(f"==================================================")
            
            context = await browser.new_context(
                viewport={"width": vp["width"], "height": vp["height"]},
                storage_state=storage_state
            )
            page = await context.new_page()
            
            for route in ROUTES:
                print(f"Testing route: {route['name']}")
                try:
                    await page.goto(route["url"], wait_until="networkidle", timeout=15000)
                    await page.wait_for_timeout(1500)
                    
                    if route.get("action") == "switch_to_list":
                        list_btn = page.locator('button[title="List View"]').first
                        if await list_btn.count() > 0:
                            await list_btn.click()
                            await page.wait_for_timeout(1000)
                    
                    # Check modal if on issues_board
                    modal_metrics = None
                    if route["name"] == "issues_board":
                        # Open new issue modal using title or text
                        new_issue_btn = page.locator('button[title="New Issue"]').first
                        if await new_issue_btn.count() == 0:
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
                    await page.screenshot(path=screenshot_path, full_page=False)
                    
                    metrics = await check_overflow_and_metrics(page)
                    
                    # Verify specific component responsive behaviors
                    checks = {}
                    
                    if "settings" in route["name"]:
                        # Settings sidebar should be hidden on mobile (< 768px)
                        settings_sidebar = page.locator('aside.hidden.md\\:flex, aside')
                        if await settings_sidebar.count() > 0:
                            sidebar_vis = await settings_sidebar.first.is_visible()
                            checks["settings_sidebar_visible"] = sidebar_vis
                            checks["settings_sidebar_correct"] = (not sidebar_vis) if is_mobile else True
                    
                    if route["name"] == "ai_chat":
                        # History floating button should be hidden on mobile (< 768px)
                        history_btn = page.locator('[data-testid="ai-bottom-history-btn"]')
                        if await history_btn.count() > 0:
                            history_vis = await history_btn.first.is_visible()
                            checks["ai_history_floating_btn_visible"] = history_vis
                            checks["ai_history_floating_btn_correct"] = (not history_vis) if is_mobile else True
                    
                    if route["name"] == "issue_detail":
                        # Right properties rail should be hidden on < 1024px
                        right_rail = page.locator('div.hidden.lg\\:block')
                        if await right_rail.count() > 0:
                            rail_vis = await right_rail.first.is_visible()
                            checks["issue_detail_right_rail_visible"] = rail_vis
                            checks["issue_detail_right_rail_correct"] = (not rail_vis) if vp["width"] < 1024 else True

                    result = {
                        "route": route["name"],
                        "url": route["url"],
                        "screenshot": screenshot_name,
                        "metrics": metrics,
                        "checks": checks,
                        "modal_metrics": modal_metrics,
                    }
                    vp_report["results"].append(result)
                    print(f"  -> clientW={metrics['clientWidth']}px, scrollW={metrics['scrollWidth']}px, overflow={metrics['hasHorizontalOverflow']}, checks={checks}")
                except Exception as ex:
                    print(f"  Error on {route['name']}: {ex}")
                    vp_report["results"].append({
                        "route": route["name"],
                        "error": str(ex)
                    })
            
            await context.close()
            report.append(vp_report)
            
        await browser.close()
        
    report_file = os.path.join(OUTPUT_DIR, "responsiveness_report.json")
    with open(report_file, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\n==================================================")
    print(f"All responsive browser tests finished successfully!")
    print(f"Report saved to: {report_file}")
    print(f"==================================================")

if __name__ == "__main__":
    asyncio.run(run_tests())
