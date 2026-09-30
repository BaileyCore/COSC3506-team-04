import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { setup } from '../tests/helpers/talent-db.mjs';
const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const express = require('../backend/node_modules/express');
const {pool,server,base} = await setup();
const app = express();
app.get('/config.js', (_req,res)=>res.type('js').send(`window.API_BASE_URL=${JSON.stringify(base)};`));
app.use(express.static(resolve('frontend')));
const frontend = app.listen(0,'127.0.0.1');
await new Promise(resolve=>frontend.once('listening',resolve));
const origin = `http://127.0.0.1:${frontend.address().port}`;
let browser;
try {
  browser = await chromium.launch({headless:true,args:['--no-sandbox']});
  const page = await browser.newPage({viewport:{width:390,height:844}});
  const failures=[];
  page.on('pageerror',error=>failures.push(error.message));
  async function noOverflow() {assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Horizontal overflow');}
  await page.goto(origin); await page.getByText('17 profiles found',{exact:true}).waitFor(); await noOverflow();
  await page.screenshot({path:resolve('r1-directory-mobile.png'),fullPage:true});
  await page.getByLabel('Search name, headline, or skill').focus();
  await page.keyboard.type('aVeRy'); await page.keyboard.press('Enter');
  await page.getByText('1 profile found',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Clear all',exact:true}).click();
  await page.getByText('17 profiles found',{exact:true}).waitFor();
  await page.getByLabel('Unity',{exact:true}).check(); await page.getByLabel('Blender',{exact:true}).check();
  await page.getByRole('button',{name:'Apply filters',exact:true}).click();
  await page.getByText('1 profile found',{exact:true}).waitFor();
  await page.getByRole('link',{name:'Maya Patel',exact:true}).click();
  await page.getByRole('heading',{name:'Maya Patel',exact:true}).waitFor(); await noOverflow();
  await page.reload(); await page.getByRole('heading',{name:'Maya Patel',exact:true}).waitFor();
  await page.getByRole('link',{name:'Industrial Safety VR Trainer',exact:true}).click();
  await page.getByRole('heading',{name:'Industrial Safety VR Trainer',exact:true}).waitFor(); await noOverflow();
  await page.getByRole('link',{name:'Inquire about this project',exact:true}).click();
  await page.getByRole('heading',{name:'Employer inquiry',exact:true}).waitFor(); await noOverflow();
  assert.equal(await page.locator('[name=source_type]').inputValue(),'project'); assert.equal(await page.locator('[name=source_id]').inputValue(),'P01');
  await page.getByLabel('Company name',{exact:true}).fill('Synthetic Company');
  await page.getByLabel('Contact name',{exact:true}).fill('Demo Tester');
  await page.getByLabel('Contact email',{exact:true}).fill('tester@example.com');
  await page.getByLabel('Inquiry description',{exact:true}).fill('Demonstration inquiry about this project.');
  await page.getByRole('button',{name:'Submit simulated inquiry'}).click();
  await page.getByRole('heading',{name:'Simulated inquiry saved',exact:true}).waitFor(); await noOverflow();
  await page.goto(origin+'/?student=S01&inquiry=1'); await page.getByRole('heading',{name:'Employer inquiry',exact:true}).waitFor();
  assert.equal(await page.locator('[name=source_id]').inputValue(),'S01');
  await page.goto(origin+'/?student=S16'); await page.getByRole('heading',{name:'Page not found',exact:true}).waitFor();
  await page.goto(origin+'/?project=P07'); await page.getByRole('heading',{name:'WebXR Campus Tour',exact:true}).waitFor();
  assert.equal(await page.locator('a[href="https://example.invalid/demo"]').getAttribute('target'),'_blank');
  await page.goto(origin); await page.getByText('17 profiles found',{exact:true}).waitFor();
  // Keyboard reaches search, changes a skill, applies filters, and opens a result.
  await page.getByLabel('Search name, headline, or skill').focus(); await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'skill-0');
  await page.keyboard.press('Space'); assert.ok(await page.locator('#skill-0').isChecked());
  assert.notEqual(await page.locator('#skill-0').evaluate(el=>getComputedStyle(el).outlineStyle),'none');
  for(let i=0;i<40;i++) {if(await page.getByRole('button',{name:'Apply filters',exact:true}).evaluate(el=>el===document.activeElement))break;await page.keyboard.press('Tab');}
  await page.keyboard.press('Enter'); await page.waitForFunction(()=>document.getElementById('count').textContent.endsWith('found'));
  for(let i=0;i<15;i++) {if(await page.evaluate(()=>document.activeElement.matches('#results a')))break;await page.keyboard.press('Tab');}
  assert.ok(await page.evaluate(()=>document.activeElement.matches('#results a')));
  await page.keyboard.press('Enter'); await page.locator('.profile-shell').waitFor();
  await page.setViewportSize({width:1440,height:1000}); await page.goto(origin); await page.getByText('17 profiles found',{exact:true}).waitFor(); await noOverflow();
  await page.screenshot({path:resolve('r1-directory-desktop.png'),fullPage:true});
  assert.deepEqual(failures,[]); console.log('PASS: 390px workflow, direct reload, inquiries, invalid profile, external-link isolation, keyboard filters and profile navigation.');
} finally {await browser?.close(); await new Promise(resolve=>frontend.close(resolve)); await new Promise(resolve=>server.close(resolve)); await pool.end();}
