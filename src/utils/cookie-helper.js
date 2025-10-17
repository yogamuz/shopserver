// Fixed cookie-helper.js with consistent expiry times
class CookieHelper {
  static getBaseCookieOptions() {
    return {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    };
  }

  // **FIX**: Consistent access token expiry
  static getAccessTokenExpiry(userRole) {
    return userRole === "admin" ? 2 * 60 * 60 * 1000 : 15 * 60 * 1000; // Admin 2h, User 15m
  }

  static getRefreshTokenExpiry() {
    return 30 * 24 * 60 * 60 * 1000; // 30 days untuk match absolute expiry
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
      maxAge: 1000 * 60 * 5, // 5 minutes for registration
    });

    res.cookie("refreshToken", refreshToken, {
      ...cookieOptions,
      maxAge: this.getRefreshTokenExpiry(),
    });
  }

  // **FIX**: Use consistent expiry calculation
  static setAccessTokenCookie(res, accessToken, userRole) {
    const cookieOptions = this.getBaseCookieOptions();
    const accessTokenExpiry = this.getAccessTokenExpiry(userRole); // Use same method

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
