import { describe, expect, it } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import { apiValidationMessage } from '../apiMessage';

function httpError(status: number, data: unknown): AxiosError {
  return new AxiosError('failed', 'ERR_BAD_REQUEST', undefined, undefined, {
    status,
    statusText: '',
    data,
    headers: {},
    config: { headers: new AxiosHeaders() },
  });
}

describe('apiValidationMessage', () => {
  // The real body of PUT /printers/:id on validation failure, copied from what
  // HttpException::toArray() emits for the UnprocessableEntityException that
  // UpdatePrinterRequest::failedValidation throws. There is no `message` and no `errors`.
  it('reads the field texts from `detail`, which is where this API puts them', () => {
    const err = httpError(422, {
      error: 'validation error',
      status_code: 422,
      detail: { copies: ['The copies field must not be greater than 3.'] },
      internal_code: 'unprocessable_entity',
    });

    expect(apiValidationMessage(err)).toBe('The copies field must not be greater than 3.');
  });

  it('joins the texts of every rejected field', () => {
    const err = httpError(422, {
      error: 'validation error',
      status_code: 422,
      detail: {
        name: ['The name field is required.'],
        address: ['The address field is required.'],
      },
      internal_code: 'unprocessable_entity',
    });

    expect(apiValidationMessage(err)).toBe('The name field is required. The address field is required.');
  });

  // Endpoints that do not override failedValidation fall to the ValidationException
  // handler of bootstrap/app.php, which sends `{ error, errors }` instead.
  it('also reads `errors`, the shape of the API-wide ValidationException handler', () => {
    const err = httpError(422, {
      status_code: 422,
      internal_code: 'contract_validation_failed',
      error: 'data validation failed',
      errors: { rows: ['The selected rows is invalid.'] },
    });

    expect(apiValidationMessage(err)).toBe('The selected rows is invalid.');
  });

  it('falls back to `error` when no field text came', () => {
    const err = httpError(422, { error: 'validation error', status_code: 422, detail: {} });

    expect(apiValidationMessage(err)).toBe('validation error');
  });

  it('answers null for a body with nothing to show and for what is not an axios error', () => {
    expect(apiValidationMessage(httpError(500, { status_code: 500 }))).toBeNull();
    expect(apiValidationMessage(new Error('boom'))).toBeNull();
  });

  // The old reader looked for Laravel's default `{ message, errors }`: with this API's real
  // body it returned null, and the operator saw the generic sentence instead of the reason.
  it('does not depend on `message`, which this API never sends on 422', () => {
    const err = httpError(422, { message: 'ignored', detail: { copies: ['pick fewer copies'] } });

    expect(apiValidationMessage(err)).toBe('pick fewer copies');
  });
});
