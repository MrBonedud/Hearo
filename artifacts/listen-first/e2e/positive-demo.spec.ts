import { expect, test } from '@playwright/test';

for (const locale of ['en-US', 'ar-JO']) {
  test(`guided demo shows six supported examples without staged mistakes (${locale})`, async ({ browser }) => {
    const context = await browser.newContext({ locale });
    const page = await context.newPage();
    await page.goto('/');
    await page.getByTestId('button-start-sample').click();
    await page.getByTestId('button-sample-begin').click();
    const sample = page.getByTestId('screen-offline-sample');
    for (let step = 0; step < 6; step++) {
      await expect(sample).toContainText(locale === 'en-US' ? 'Prepared supported example' : 'مثال جاهز مدعوم');
      await expect(sample).not.toContainText(/Prepared incomplete example|Prepared misconception|مثال جاهز ناقص|فهم غلط جاهز|خطأ مكتوب مسبقًا/);
      await page.getByTestId(step === 5 ? 'button-sample-finish' : 'button-sample-next').click();
    }
    await expect(page.getByTestId('sample-report')).toContainText(locale === 'en-US' ? 'six source-supported explanations' : 'ستة شروحات مدعومة بالمصدر');
    await expect(page.getByTestId('sample-report')).not.toContainText(/prewritten mistake|الغلطة المكتوبة مسبقًا/);
    await expect(sample).toContainText(locale === 'en-US' ? 'It is not evaluated by AI' : 'ما بيقيّمه الذكاء الاصطناعي');
    await context.close();
  });
}
