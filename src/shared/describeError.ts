export type ErrorDescription = {
  name: string;
  message: string;
  method?: string;
  url?: string;
  status?: number;
  code?: string;
  reachedServer?: boolean;
};

type AxiosLike = {
  isAxiosError: true;
  code?: unknown;
  config?: { method?: unknown; url?: unknown };
  response?: { status?: unknown };
};

// Duck typing instead of `instanceof AxiosError`: this module is shared by the
// main process and the renderer, and axios belongs to the renderer. Importing it
// here would copy the whole HTTP client into the main bundle too, for a type
// guard — electron-vite externalizes only `dependencies`, so a devDependency is
// bundled, not required at runtime.
function isAxiosLike(err: object): err is AxiosLike {
  return 'isAxiosError' in err && err.isAxiosError === true;
}

// The query string can carry tokens or personal data, and the route is enough to
// identify the call.
function withoutQuery(url: string): string {
  const cut = url.search(/[?#]/);

  return cut === -1 ? url : url.slice(0, cut);
}

/**
 * Picks, field by field, what is safe and useful to write to the log file. An
 * AxiosError carries `config.headers` (session cookie, Authorization) and the
 * response body, so the raw error must never reach the logger (RN-02).
 */
export function describeError(err: unknown): ErrorDescription {
  if (typeof err !== 'object' || err === null) {
    return { name: 'NonError', message: typeof err === 'string' ? err : `thrown value of type ${typeof err}` };
  }

  const name = 'name' in err && typeof err.name === 'string' ? err.name : 'Error';
  const message = 'message' in err && typeof err.message === 'string' ? err.message : '';

  if (!isAxiosLike(err)) {
    return { name, message };
  }

  const description: ErrorDescription = { name, message };

  if (typeof err.config?.method === 'string') {
    description.method = err.config.method.toUpperCase();
  }

  if (typeof err.config?.url === 'string') {
    description.url = withoutQuery(err.config.url);
  }

  if (typeof err.code === 'string') {
    description.code = err.code;
  }

  if (typeof err.response?.status === 'number') {
    description.status = err.response.status;
    description.reachedServer = true;
  } else {
    description.reachedServer = false;
  }

  return description;
}
