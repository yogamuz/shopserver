class CookieHelper {
  static getBaseCookieOptions() {
    const isProduction = process.env.NODE_ENV === "production";

    return {
      httpOnly: true,
      secure: isProduction, // ✅ FIX: false di dev, true di prod
      sameSite: isProduction ? "none" : "lax", // ✅ FIX: 'lax' di dev, 'none' di prod
      path: "/",
    };
  }

  static getAccessTokenExpiry(userRole) {
    return userRole === "admin" ? 2 * 60 * 60 * 1000 : 15 * 60 * 1000;
  }

  static getRefreshTokenExpiry() {
    return 30 * 24 * 60 * 60 * 1000;
  }

  static setCookies(res, accessToken, refreshToken, userRole) {
    const cookieOptions = this.getBaseCookieOptions();

    res.cookie("refreshToken", refreshToken, {
      ...cookieOptions,
      maxAge: this.getRefreshTokenExpiry(),
    });
  }

  static setRegistrationCookies(res, accessToken, refreshToken) {
    const cookieOptions = this.getBaseCookieOptions();

    // ONLY set refreshToken cookie
    res.cookie("refreshToken", refreshToken, {
      ...cookieOptions,
      maxAge: this.getRefreshTokenExpiry(),
    });
  }

  static clearCookies(res) {
    const cookieOptions = this.getBaseCookieOptions();
    res.clearCookie("refreshToken", cookieOptions);
  }
}

module.exports = CookieHelper;
