export const successResponse = (res, data, status = 200) => {
  return res.status(status).json({
    success: true,
    data
  });
};

export const errorResponse = (res, message, code = 'INTERNAL_ERROR', status = 400, details = null) => {
  return res.status(status).json({
    success: false,
    message,
    code,
    ...(details ? { details } : {})
  });
};