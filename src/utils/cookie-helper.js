// ========================================
// FILE: src/utils/cookieHelper.js
// ========================================
class CookieHelper {
  static getBaseCookieOptions() {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    };
  }

  static getAccessTokenExpiry(userRole) {
    return userRole === 'admin' ? 2 * 60 * 60 * 1000 : 5 * 60 * 1000;
  }

  static getRefreshTokenExpiry() {
    return 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
  }

  static setCookies(res, accessToken, refreshToken, userRole) {
    const cookieOptions = this.getBaseCookieOptions();
    const accessTokenExpiry = this.getAccessTokenExpiry(userRole);

    res.cookie("authToken", accessToken, {
      ...cookieOptions,
      maxAge: accessTokenExpiry,
    });

    res.cookie("refreshToken", refreshToken, {
      ...cookieOptions,
      maxAge: this.getRefreshTokenExpiry(),
    });
  }

  static setRegistrationCookies(res, accessToken, refreshToken) {
    const cookieOptions = this.getBaseCookieOptions();

    res.cookie("authToken", accessToken, {
      ...cookieOptions,
      maxAge: 5 * 60 * 1000, // 5 minutes for registration
    });

    res.cookie("refreshToken", refreshToken, {
      ...cookieOptions,
      maxAge: this.getRefreshTokenExpiry(),
    });
  }

  static setAccessTokenCookie(res, accessToken, userRole) {
    const cookieOptions = this.getBaseCookieOptions();
    const accessTokenExpiry = userRole === 'admin' ? 2 * 60 * 60 * 1000 : 60 * 60 * 1000; // admin 2 hours or user 1 hour

    res.cookie("authToken", accessToken, {
      ...cookieOptions,
      maxAge: accessTokenExpiry,
    });
  }

  static clearCookies(res) {
    const cookieOptions = this.getBaseCookieOptions();
    res.clearCookie("authToken", cookieOptions);
    res.clearCookie("refreshToken", cookieOptions);
  }
}

module.exports = CookieHelper;