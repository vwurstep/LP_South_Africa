// node test/data.test.mjs — parseLocation cases
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { parseLocation } = await import('../src/data.js');
const cases = [
  ['-33.9249, 18.4241', [-33.9249, 18.4241]],
  ['https://www.google.com/maps/place/Kloof+Street+House/@-33.9311,18.4096,17z/data=!3m1!4b1!4m6!3m5!1s0x1dcc!8m2!3d-33.9312!4d18.4101', [-33.9312, 18.4101]],
  ['https://maps.google.com/?q=-34.1936,18.4508', [-34.1936, 18.4508]],
  ['https://maps.app.goo.gl/abc123', null],
];
let fail = 0;
for (const [input, want] of cases) {
  const got = parseLocation(input);
  const ok = want === null ? got === null : got && got.lat === want[0] && got.lng === want[1];
  if (!ok) { fail++; console.log('FAIL', input, got); }
}
console.log(fail ? `${fail} failed` : 'all passed');
process.exit(fail ? 1 : 0);
