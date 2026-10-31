const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const code = fs.readFileSync(require('path').join(__dirname, '../public/hack/js/acesso.js'), 'utf8');

async function run(hash, needsPassword, submitPassword) {
  const elements = new Map();
  function get(id) {
    if (!elements.has(id)) elements.set(id, {
      hidden: true, href: '', value: '', textContent: '',
      querySelector: () => null, focus() {},
      addEventListener(type, fn) { this[type] = fn; },
    });
    return elements.get(id);
  }
  const locations = [];
  const history = [];
  const context = {
    URLSearchParams,
    document: { getElementById: get },
    location: { hash, pathname: '/hack/acesso', replace: (url) => locations.push(url) },
    history: { replaceState: (...args) => history.push(args) },
    window: { Hack: { api: async (url) => url.includes('/consume') ? { needsPassword } : url.includes('/session') ? { authenticated: true } : {} } },
  };
  vm.runInNewContext(code, context);
  await new Promise((resolve) => setImmediate(resolve));
  if (submitPassword) {
    await get('form-senha').submit({ preventDefault() {}, target: {
      password: { value: '12345678' }, confirm: { value: '12345678' }, querySelector: () => ({ disabled: false }),
    } });
  }
  return { locations, history, skip: get('pular-senha').href };
}

(async () => {
  let r = await run('#t=token&next=avaliacao', false, false);
  assert.deepStrictEqual(r.locations, ['/hack/avaliacao']);
  assert.strictEqual(r.history[0][2], '/hack/acesso');
  r = await run('#t=token&next=avaliacao', true, true);
  assert.deepStrictEqual(r.locations, ['/hack/avaliacao']);
  assert.strictEqual(r.skip, '/hack/avaliacao');
  r = await run('#t=token&next=https%3A%2F%2Fevil.example', false, false);
  assert.deepStrictEqual(r.locations, ['/hack/portal']);
  r = await run('#next=avaliacao', false, false);
  assert.deepStrictEqual(r.locations, ['/hack/avaliacao']);
  console.log('Acesso: destino permitido, fluxo de senha e rejeição de redirecionamento externo OK.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
