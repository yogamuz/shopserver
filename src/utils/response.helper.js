const { HTTP_STATUS } = require('../constants/httpStatus');

/**
 * Response helper utilities for consistent API responses
 */
class ResponseHelper {
  /**
   * Send success response
   * @param {Object} res - Express response object
   * @param {number} statusCode - HTTP status code
   * @param {string} message - Success message
   * @param {Object} data - Response data
   */
  static success(res, statusCode = HTTP_STATUS.OK, message = 'Success', data = null) {
    const response = {
      success: true,
      message
    };

    if (data !== null) {
      response.data = data;
    }

    return res.status(statusCode).json(response);
  }

  /**
   * Send error response
   * @param {Object} res - Express response object
   * @param {number} statusCode - HTTP status code
   * @param {string} message - Error message
   * @param {string} error - Error details
   */
  static error(res, statusCode = HTTP_STATUS.INTERNAL_SERVER_ERROR, message = 'Internal Server Error', error = null) {
    const response = {
      success: false,
      message
    };

    if (error) {
      response.error = error;
    }

    return res.status(statusCode).json(response);
  }

  /**
   * Send not found response
   * @param {Object} res - Express response object
   * @param {string} message - Not found message
   */
  static notFound(res, message = 'Resource not found') {
    return this.error(res, HTTP_STATUS.NOT_FOUND, message);
  }

  /**
   * Send bad request response
   * @param {Object} res - Express response object
   * @param {string} message - Bad request message
   */
  static badRequest(res, message = 'Bad request') {
    return this.error(res, HTTP_STATUS.BAD_REQUEST, message);
  }

  /**
   * Send created response
   * @param {Object} res - Express response object
   * @param {string} message - Success message
   * @param {Object} data - Created resource data
   */
  static created(res, message = 'Resource created successfully', data = null) {
    return this.success(res, HTTP_STATUS.CREATED, message, data);
  }
}

module.exports = ResponseHelper;