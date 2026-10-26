const jar = new Map();

async function cookies() {
  return {
    get(name) {
      if (name === "fweta_session" && process.env.FWETA_SESSION && !jar.has(name)) {
        return { name, value: process.env.FWETA_SESSION };
      }
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
