export const sendSuccess = (res, data = {}, message = "Success", statusCode = 200) => {
  return res.status(statusCode).json({ success: true, message, data });
};

export const sendError = (res, message = "An error occurred.", statusCode = 400, data = {}) => {
  return res.status(statusCode).json({ success: false, message, data });
};