import { errorResponse } from '../utils/apiResponse.js';

export default function errorHandler(err, req, res, next) {
  console.error('Unhandled error:', err);

  const status = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';
  const message = err.message || 'Error interno del servidor';

  return errorResponse(res, message, code, status, err.details || null);
}