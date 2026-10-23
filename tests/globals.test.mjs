/**
 * Uygulama betikleri (public/kohesap-app) ortak global kapsamda yüklenir: iki dosyada aynı
 * üst düzey const / let / function adı olursa ikincisi SyntaxError verir ve o dosya hiç çalışmaz.
 * Bu test index.html'deki betik sırasına göre çakışma arar ve her betiğin sözdizimini denetler.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

const DIR = join(import.meta.dirname, '..', 'public', 'kohesap-app');
const scripts = [...readFileSync(join(DIR, 'index.html'), 'utf8').matchAll(/<script src="([^"]+)"/g)].map(m => m[1]).filter(f => !/^https?:/.test(f));

test('betikler sözdizimi hatasız', () => {
  for (const f of scripts) assert.doesNotThrow(() => new vm.Script(readFileSync(join(DIR, f), 'utf8'), { filename: f }), f);
});

test('üst düzey adlar dosyalar arasında çakışmıyor', () => {
  const seen = new Map(), dups = [];
  for (const f of scripts) {
    const src = readFileSync(join(DIR, f), 'utf8');
    for (const m of src.matchAll(/^(?:const|let|class|function|async function)\s+([A-Za-z_$][\w$]*)/gm)) {
      const prev = seen.get(m[1]);
      if (prev && prev !== f) dups.push(`${m[1]}: ${prev} ↔ ${f}`);
      else seen.set(m[1], f);
    }
  }
  assert.deepEqual(dups, []);
});
