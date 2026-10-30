// Fails if any layout rendered by `trmnlp build` is empty or shows a Liquid error.
// Usage: node .github/scripts/check-build.mjs _build
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2] ?? '_build';
let failed = false;
for (const view of ['full', 'half_horizontal', 'half_vertical', 'quadrant']) {
  const html = fs.readFileSync(path.join(dir, `${view}.html`), 'utf8');
  // Markup after the shared <style> block is the layout itself; a swallowed template leaves none.
  const body = html.slice(html.lastIndexOf('</style>'));
  const problems = [
    !body.includes('class="title_bar"') && 'no title bar',
    !body.includes('class="mw') && 'no layout markup',
    /Liquid (syntax )?error/i.test(html) && 'Liquid error',
  ].filter(Boolean);
  console.log(`${problems.length ? 'FAIL' : 'ok  '} ${view}${problems.length ? `: ${problems.join(', ')}` : ''}`);
  failed ||= problems.length > 0;
}
process.exitCode = failed ? 1 : 0;
