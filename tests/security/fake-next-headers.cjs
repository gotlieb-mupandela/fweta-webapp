const jar = new Map();

async function cookies() {
  return {
    get(name) {
      if (!jar.has(name)) return undefined;
      return { name, value: jar.get(name) };
    },
    set(name, value) {
      jar.set(name, String(value));
    },
  };
}

async function headers() {
  return {
    get() {
      return null;
    },
  };
}

module.exports = { cookies, headers };
