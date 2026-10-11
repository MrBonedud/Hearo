import { expect, test } from '@playwright/test';

for (const locale of ['en-US', 'ar-JO']) {
  test(`guided demo uses natural answers without announcing staged mistakes (${locale})`, async ({ browser }) => {
    const context = await browser.newContext({ locale });
    const page = await context.newPage();
    await page.goto('/');
    await page.getByTestId('button-start-sample').click();
    await page.getByTestId('button-sample-begin').click();
    const sample = page.getByTestId('screen-offline-sample');
    for (let step = 0; step < 6; step++) {
      await expect(page.getByTestId('sample-script')).toBeVisible();
      await expect(sample).not.toContainText(/Prepared incomplete example|Prepared misconception|مثال جاهز ناقص|فهم غلط جاهز|خطأ مكتوب مسبقًا/);
      if (step === 3) {
        await expect(page.getByTestId('sample-script')).toHaveText('Sharding يوزّع قاعدة البيانات على عدة مثيلات، ويسمّى كل جزء Data shard.');
        await expect(page.getByTestId('concept-sharding')).toHaveClass(/status-partial/);
      }
      if (step === 5) {
        await expect(page.getByTestId('sample-script')).toHaveText('التخزين المؤقت يسرّع الكتابات تلقائيًا، فلا حاجة لإرسالها إلى DBMS.');
        await expect(page.getByTestId('concept-caching')).toHaveClass(/status-incorrect/);
        await expect(page.getByTestId('sample-evidence')).toContainText('Writes must still go to the DBMS');
      }
      await page.getByTestId(step === 5 ? 'button-sample-finish' : 'button-sample-next').click();
    }
    await expect(page.getByTestId('sample-report')).toContainText(locale === 'en-US' ? 'Compare your explanation with slide 10' : 'قارن شرحك بالشريحة 10');
    await expect(page.getByTestId('sample-report')).not.toContainText(/prewritten mistake|الغلطة المكتوبة مسبقًا/);
    await expect(sample).toContainText(locale === 'en-US' ? 'It is not evaluated by AI' : 'ما بيقيّمه الذكاء الاصطناعي');
    await context.close();
  });
}
