import { AxiosError } from 'axios';

// This is NOT Laravel's default error body: the delivery-api replaces it.
//
// `PUT /printers/:id` fails validation through `UpdatePrinterRequest::failedValidation`,
// which throws `UnprocessableEntityException('validation error', 422, $errors)`. That third
// argument is `HttpException::$detail`, and `HttpException::toArray()` — what both
// `BaseException::render()` and the `CoreHttpException` handler in `bootstrap/app.php` send —
// emits `{ error, status_code, detail, internal_code }`. So the field texts arrive in
// **`detail`**, and neither `message` nor `errors` exists:
//
//   { "error": "validation error", "status_code": 422,
//     "detail": { "copies": ["..."] }, "internal_code": "unprocessable_entity" }
//
// `errors` is read too because endpoints that do *not* override `failedValidation` fall to
// the `ValidationException` handler of `bootstrap/app.php`, which sends `{ error, errors }`.
interface ErrorBody {
  detail?: unknown;
  errors?: unknown;
  error?: unknown;
}

function fieldTexts(value: unknown): string | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const texts = Object.values(value as Record<string, unknown>)
    .flat()
    .filter((text): text is string => typeof text === 'string');

  return texts.length > 0 ? texts.join(' ') : null;
}

export function apiValidationMessage(err: unknown): string | null {
  if (!(err instanceof AxiosError)) {
    return null;
  }

  const body = err.response?.data as ErrorBody | undefined;

  // The per-field texts are the only part the operator can act on, so they come first.
  const texts = fieldTexts(body?.detail) ?? fieldTexts(body?.errors);

  if (texts) {
    return texts;
  }

  return typeof body?.error === 'string' && body.error ? body.error : null;
}
