import asyncio
from playwright.async_api import async_playwright

async def inspect():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context()
        page = await context.new_page()
        page.on('console', lambda msg: print('BROWSER CONSOLE:', msg.type, msg.text))
        
        # Navigate to login
        print('Navigating to login...')
        await page.goto('http://localhost:3000/login', wait_until='networkidle')
        await page.fill('input[type="email"]', 'alex@acme.inc')
        await page.fill('input[type="password"]', 'password123')
        
        # Submit form
        print('Submitting login form...')
        await page.click('button[type="submit"]')
        
        # Wait for navigation to complete
        await page.wait_for_url('**/issues**', timeout=15000)
        print('Successfully logged in, current url:', page.url)

        # Check localStorage token
        ls_token = await page.evaluate("() => localStorage.getItem('supabase_access_token')")
        print('LOCALSTORAGE TOKEN AFTER LOGIN:', ls_token[:30] if ls_token else 'NONE')

        # Now navigate to AI page using the same authenticated browser context
        print('Navigating to AI page...')
        await page.goto('http://localhost:3000/acme/ai', wait_until='networkidle')
        await page.wait_for_timeout(2000)

        # Inspect organizationId in page
        org_resolved = await page.evaluate("() => window.location.pathname")
        print('Pathname:', org_resolved)

        textarea = page.locator('textarea').first
        await textarea.fill('List all issues in team ENG')
        await textarea.press('Enter')
        print('Sent message, waiting for response...')
        await page.wait_for_timeout(6000)

        await page.screenshot(path=r"C:\Users\ktmay\.gemini\antigravity-ide\brain\de56e761-1dd0-4ebd-be65-570cb5673aa7\auth_test_result.png")
        await browser.close()

if __name__ == '__main__':
    asyncio.run(inspect())
