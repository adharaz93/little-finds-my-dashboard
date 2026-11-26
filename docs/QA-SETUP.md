# Browser QA setup (Windows)

This starter pack does not assume a Playwright setup exists. First inspect `package.json`, the lockfile and existing browser-test tooling.

Recommended free option: Playwright Test with Microsoft Edge or Chromium. Add it only after confirming it is not already installed and reviewing the package changes. Use a separate test port (for example 3107), synthetic seed data and an isolated browser context/profile. Never use the user's normal browser profile.

A `test:e2e` npm script must exist before `Invoke-LfmQualityGates.ps1` can pass browser QA. Configure the test runner to start and stop its own test server (for example with Playwright `webServer`).

Minimum checks:
- app routes load;
- no page or console errors;
- no hydration warnings;
- key navigation and task-specific workflow;
- viewport widths 375, 768 and 1440;
- no horizontal overflow;
- synthetic test data cannot overwrite real localStorage;
- cleanup only resources created by that run.

If isolated browser QA cannot run, report `BROWSER QA NOT RUN` and stop before automatic commit/push. A successful build or screenshot is not a substitute.
